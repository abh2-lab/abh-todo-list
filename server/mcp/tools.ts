// What an AI app can do through the MCP connection (server/routes/mcp.ts): read, make and change
// notes, delete them (after asking the user), and see and arrange groups.
// It acts as the person whose key it uses, with the same rules as the app: their own private
// notes and the public notes, never other people's private notes.
// Notes go to the AI as Markdown and come back as Markdown (server/mcp/markdown.ts).

import { randomInt, randomUUID } from 'node:crypto'
import { and, count, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import { documents, groupNotes, noteGroups, tasks, type NewDocument } from '../../db/schema'
import { useDb } from '../db'
import { cleanBoard, type CardContent } from '#shared/board'
import { cleanKanban } from '#shared/kanban'
import { withoutNul } from '#shared/text'
import type { AiCaller } from '../utils/aiKeys'
import { hideQueryValues } from '../utils/dbErrors'
import { useDailyLimit } from '../utils/dailyLimit'
import { MAX_GROUPS, MAX_GROUP_NOTES, cleanGroupName, ownGroup, previewFromJsonText } from '../utils/groups'
import { markEditing } from '../utils/noteEditors'
import { editableBy, freeNoteTitle, viewableBy } from '../utils/notes'
import { noteTaskLines, syncNoteTasks } from '../utils/tasks'
import { markdownAsNote, noteAsMarkdown } from './markdown'

/** The same count as making notes in the app (server/api/documents/index.post.ts). */
const MAX_NEW_NOTES_A_DAY = 100
/** The biggest note an AI app can send, in characters of Markdown. */
const MAX_MARKDOWN = 2_000_000
const MAX_IDS = 100
const DELETE_CODE_MS = 10 * 60 * 1000

const NOT_FOUND = 'There is no note with this id that the user can open. (list_notes gives the ids.)'
const NOT_EDITABLE = 'There is no note with this id that the user can change. (list_notes gives the ids.)'
const NO_GROUP = 'The user has no group with this id. (list_groups gives the ids.)'

/** Told to the AI app when it connects. */
export const INSTRUCTIONS = `This is the user's notes app. You act as the user.
- Notes are Markdown here: read_note gives you a note as Markdown, and you send Markdown back.
- Read a note before you change it. For most changes use edit_note with "edits" (old_text → new_text): everything you don't touch stays exactly as it was, like pictures, their sizes and tables.
- New notes are private (only the user sees them). Public notes can be seen and changed by everyone who uses the app: make or change a public note only when the user asks.
- Pasted pictures show as ![name](picture:1a2b3c4d). Keep that text as it is to keep the picture (you can move it or delete it). A new picture needs a web address: ![name](https://…).
- A line ending with <!-- task:… --> is one of the user's Daily tasks. Keep the mark at the end of its line, even when you change the words. Don't make up new marks, and don't tick or untick their boxes (the app sets those from the task).
- An empty line in a note shows as <br> on a line of its own. A YouTube video is @[youtube](https://www.youtube.com/watch?v=…) on a line of its own.
- Groups are like labels: a note can be in many groups. Each group also has a Mind map and a Kanban board in the app (read_group shows them; you can't change them here).
- Never delete a note without asking the user first. delete_note moves it to the Trash, where it can be restored for 30 days.`

type JsonSchema = Record<string, unknown>

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: JsonSchema
  annotations: Record<string, unknown>
}

export interface ToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

/** A problem the AI can fix (a wrong id, a missing value): sent back to it as the tool's answer. */
class ToolError extends Error {}

type Args = Record<string, unknown>
type Handler = (args: Args, caller: AiCaller) => Promise<string>

const READ_ONLY = { readOnlyHint: true, openWorldHint: false }
const CHANGES = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

const noteIdSchema = { type: 'string', description: 'The id of the note (from list_notes).' }
const groupIdSchema = { type: 'string', description: 'The id of the group (from list_groups).' }
const noteIdsSchema = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: MAX_IDS, description: 'Ids of notes (from list_notes).' }

export const TOOLS: ToolDef[] = [
  {
    name: 'list_notes',
    title: 'List notes',
    description: 'List the notes the user can open: their own private notes and the public notes, newest change first. '
      + 'Search with query (every word must be in the title or the text). Gives each note\'s id, title, private or public, '
      + 'when it was last changed, and its groups.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to look for in the titles and texts.' },
        group_id: { type: 'string', description: 'Only the notes in this group (from list_groups).' },
        kind: { type: 'string', enum: ['all', 'private', 'public'], description: '"private": only the user\'s own notes. "public": only public notes. Default: all.' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: 'At most this many notes. Default: 50.' },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'read_note',
    title: 'Read a note',
    description: 'Read a note as Markdown, with its title, id, private or public, when it was last changed (updated_at), and its groups. '
      + 'A long note comes in parts: use offset to read on.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: noteIdSchema,
        offset: { type: 'integer', minimum: 0, description: 'Start at this character of the Markdown. Default: 0.' },
        max_chars: { type: 'integer', minimum: 1000, maximum: 100000, description: 'At most this many characters. Default: 40000.' },
      },
      required: ['note_id'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'create_note',
    title: 'Make a note',
    description: 'Make a new note from Markdown. It is private (only the user sees it), unless private is false. '
      + 'Make a public note only when the user asks for one: everyone who uses the app can see and change public notes. '
      + 'The title is shown on its own, so don\'t start the content with it.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200, description: 'The name of the note.' },
        content: { type: 'string', description: 'The note in Markdown.' },
        private: { type: 'boolean', description: 'Default: true.' },
        group_id: { type: 'string', description: 'Also put the note in this group (from list_groups).' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, idempotentHint: false },
  },
  {
    name: 'edit_note',
    title: 'Change a note',
    description: 'Change a note: its title, and its text in one of three ways (use only one at a time):\n'
      + '- edits: change parts of the Markdown that read_note gave you. Each old_text must be in the note exactly once (or use replace_all). '
      + 'Everything else stays exactly as it is. Best for most changes.\n'
      + '- append: add Markdown at the end of the note.\n'
      + '- content: replace the whole note with new Markdown. Read the note with read_note first.\n'
      + 'Anyone who has the note open in the app sees the change.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: noteIdSchema,
        title: { type: 'string', maxLength: 200, description: 'A new name for the note.' },
        edits: {
          type: 'array',
          minItems: 1,
          maxItems: 50,
          description: 'Changes, done one after the other.',
          items: {
            type: 'object',
            properties: {
              old_text: { type: 'string', description: 'Markdown that is in the note now, copied exactly.' },
              new_text: { type: 'string', description: 'What to put there instead. Empty: take it out.' },
              replace_all: { type: 'boolean', description: 'Change every place where old_text is. Default: false.' },
            },
            required: ['old_text', 'new_text'],
            additionalProperties: false,
          },
        },
        append: { type: 'string', description: 'Markdown to add at the end.' },
        content: { type: 'string', description: 'The whole new note, in Markdown.' },
      },
      required: ['note_id'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, destructiveHint: true, idempotentHint: false },
  },
  {
    name: 'delete_note',
    title: 'Delete a note',
    description: 'Move a note to the Trash (the user can restore it there for 30 days). Always ask the user first. '
      + 'It works in two steps: call it without confirm_code to get a code. Ask the user. Only if they say yes, call it again with the code.',
    inputSchema: {
      type: 'object',
      properties: {
        note_id: noteIdSchema,
        confirm_code: { type: 'string', description: 'The code from the first step, after the user said yes.' },
      },
      required: ['note_id'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, destructiveHint: true, idempotentHint: true },
  },
  {
    name: 'list_groups',
    title: 'List groups',
    description: 'List the user\'s groups of notes (groups are like labels), with their ids and how many notes are in each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
  },
  {
    name: 'read_group',
    title: 'Read a group',
    description: 'Show a group: its notes (with their first words), its Mind map (cards and the lines between them) and its Kanban board (columns and cards).',
    inputSchema: {
      type: 'object',
      properties: { group_id: groupIdSchema },
      required: ['group_id'],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
  },
  {
    name: 'create_group',
    title: 'Make a group',
    description: 'Make a new group, and put notes in it if you like.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 100, description: 'The name of the group.' },
        note_ids: noteIdsSchema,
      },
      required: ['name'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, idempotentHint: false },
  },
  {
    name: 'rename_group',
    title: 'Rename a group',
    description: 'Give a group a new name.',
    inputSchema: {
      type: 'object',
      properties: { group_id: groupIdSchema, name: { type: 'string', maxLength: 100, description: 'The new name.' } },
      required: ['group_id', 'name'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, idempotentHint: true },
  },
  {
    name: 'add_notes_to_group',
    title: 'Put notes in a group',
    description: 'Put notes in a group. A note can be in many groups, and it stays in the notes list too.',
    inputSchema: {
      type: 'object',
      properties: { group_id: groupIdSchema, note_ids: noteIdsSchema },
      required: ['group_id', 'note_ids'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, idempotentHint: true },
  },
  {
    name: 'remove_notes_from_group',
    title: 'Take notes out of a group',
    description: 'Take notes out of a group. The notes themselves don\'t change, and they stay in the notes list. Their cards go off the group\'s boards.',
    inputSchema: {
      type: 'object',
      properties: { group_id: groupIdSchema, note_ids: noteIdsSchema },
      required: ['group_id', 'note_ids'],
      additionalProperties: false,
    },
    annotations: { ...CHANGES, idempotentHint: true },
  },
]

const HANDLERS: Record<string, Handler> = {
  list_notes: listNotes,
  read_note: readNote,
  create_note: createNote,
  edit_note: editNote,
  delete_note: deleteNote,
  list_groups: listGroups,
  read_group: readGroup,
  create_group: createGroup,
  rename_group: renameGroup,
  add_notes_to_group: addNotesToGroup,
  remove_notes_from_group: removeNotesFromGroup,
}

export function hasTool(name: unknown): name is string {
  return typeof name === 'string' && Object.hasOwn(HANDLERS, name)
}

/** Run a tool. A problem goes back to the AI as an answer with isError, so it can try again. */
export async function callTool(name: string, args: unknown, caller: AiCaller): Promise<ToolResult> {
  if (!hasTool(name)) return { content: [{ type: 'text', text: `There is no tool called ${quote(String(name))}.` }], isError: true }
  const input: Args = args && typeof args === 'object' && !Array.isArray(args) ? (args as Args) : {}
  try {
    const text = await HANDLERS[name]!(input, caller)
    return { content: [{ type: 'text', text }] }
  } catch (e) {
    let message: string
    const status = (e as { statusCode?: number } | null)?.statusCode
    if (e instanceof ToolError) message = e.message
    // The app's own checks (like "Group not found", or the daily limit): their message is for people.
    else if (status && status < 500 && e instanceof Error && e.message) message = e.message
    else {
      console.error(`[mcp] ${name} failed:`, hideQueryValues(e))
      message = 'Something went wrong on the server. Try again in a moment.'
    }
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}

// ---- Reading the values the AI sent ----

function text(args: Args, key: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) {
    if (opts.required) throw new ToolError(`${key} is needed.`)
    return undefined
  }
  if (typeof value !== 'string') throw new ToolError(`${key} must be text.`)
  if (opts.max !== undefined && value.length > opts.max) throw new ToolError(`${key} is too long: at most ${opts.max} characters.`)
  return withoutNul(value).replace(/\r\n?/g, '\n')
}

function whole(args: Args, key: string, opts: { min: number; max: number; fallback: number }): number {
  const value = args[key]
  if (value === undefined || value === null) return opts.fallback
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ToolError(`${key} must be a whole number.`)
  return Math.min(opts.max, Math.max(opts.min, value))
}

function yesNo(args: Args, key: string, fallback: boolean): boolean {
  const value = args[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new ToolError(`${key} must be true or false.`)
  return value
}

const ID = /^[\w-]{1,100}$/

function idOf(args: Args, key: string, notFound: string): string {
  const id = text(args, key, { required: true, max: 200 })!.trim()
  if (!ID.test(id)) throw new ToolError(notFound)
  return id
}

function idsOf(args: Args, key: string): string[] {
  const value = args[key]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) throw new ToolError(`${key} must be a list of ids.`)
  if (value.length > MAX_IDS) throw new ToolError(`${key} can have at most ${MAX_IDS} ids at a time.`)
  // Ids that look wrong are kept too: they are not found, and the answer says so.
  return [...new Set((value as string[]).map((v) => withoutNul(v).trim().slice(0, 200)).filter(Boolean))]
}

/** The user's group with the id in args[key]. */
async function groupOf(args: Args, key: string, userId: string) {
  const id = text(args, key, { required: true, max: 200 })!.trim()
  if (!ID.test(id)) throw new ToolError(NO_GROUP)
  try {
    return await ownGroup(userId, id)
  } catch (e) {
    if ((e as { statusCode?: number } | null)?.statusCode === 404) throw new ToolError(NO_GROUP)
    throw e
  }
}

// ---- Small helpers ----

const quote = (s: string) => JSON.stringify(s)
const nameOf = (title: string | null | undefined) => quote(title?.trim() || 'Untitled')
const timeText = (d: Date) => `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function clip(s: string, max: number): string {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

function warningsText(warnings: string[]): string {
  return warnings.length ? `\nNote:\n${warnings.map((w) => `- ${w}`).join('\n')}` : ''
}

function kindText(ownerId: string | null, userId: string): string {
  if (ownerId === null) return 'public: everyone who uses the app can see and change it'
  if (ownerId === userId) return 'private: only the user can see it'
  return 'someone else\'s private note, shared with a link: you can read it, not change it'
}

/** The user's groups each of these notes is in. */
async function groupsOf(noteIds: string[], userId: string): Promise<Map<string, { id: string; name: string }[]>> {
  const out = new Map<string, { id: string; name: string }[]>()
  if (!noteIds.length) return out
  const rows = await useDb()
    .select({ docId: groupNotes.docId, id: noteGroups.id, name: noteGroups.name })
    .from(groupNotes)
    .innerJoin(noteGroups, eq(noteGroups.id, groupNotes.groupId))
    .where(and(eq(noteGroups.userId, userId), inArray(groupNotes.docId, noteIds)))
    .orderBy(sql`lower(${noteGroups.name})`)
  for (const r of rows) {
    const list = out.get(r.docId) ?? []
    list.push({ id: r.id, name: r.name })
    out.set(r.docId, list)
  }
  return out
}

// What each key read last, so it doesn't replace a whole note that changed since (content: …).
// Kept in the server's memory only: after a restart the AI app reads the note again.
const MAX_REMEMBERED = 5000
const readAt = new Map<string, number>()

function remember(keyId: string, docId: string, updatedAt: Date) {
  const key = `${keyId}:${docId}`
  readAt.delete(key)
  readAt.set(key, updatedAt.getTime())
  if (readAt.size > MAX_REMEMBERED) readAt.delete(readAt.keys().next().value!)
}

function readThisVersion(keyId: string, docId: string, updatedAt: Date): boolean {
  return readAt.get(`${keyId}:${docId}`) === updatedAt.getTime()
}

// ---- Notes ----

async function listNotes(args: Args, caller: AiCaller): Promise<string> {
  const query = text(args, 'query', { max: 200 })?.trim() ?? ''
  const kind = text(args, 'kind', { max: 20 }) ?? 'all'
  if (kind !== 'all' && kind !== 'private' && kind !== 'public') throw new ToolError('kind must be "all", "private" or "public".')
  const limit = whole(args, 'limit', { min: 1, max: 200, fallback: 50 })
  const userId = caller.user.id
  const db = useDb()

  const where: SQL[] = [editableBy(userId)]
  if (kind === 'private') where.push(eq(documents.userId, userId))
  if (kind === 'public') where.push(isNull(documents.userId))
  let groupName: string | null = null
  if (args.group_id !== undefined && args.group_id !== null) {
    const group = await groupOf(args, 'group_id', userId)
    groupName = group.name
    where.push(inArray(documents.id, db.select({ id: groupNotes.docId }).from(groupNotes).where(eq(groupNotes.groupId, group.id))))
  }
  // Every word must be in the title or in the words of the note (not in its settings or pictures).
  for (const word of query.split(/\s+/).filter(Boolean).slice(0, 8)) {
    const pattern = `%${word.replace(/[\\%_]/g, '\\$&')}%`
    where.push(sql`(${documents.title} ilike ${pattern} or exists (
      select 1 from jsonb_path_query(${documents.content}::jsonb, 'lax $.**.text') as t(v) where t.v #>> '{}' ilike ${pattern}
    ))`)
  }

  const rows = await db
    .select({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt, userId: documents.userId })
    .from(documents)
    .where(and(...where))
    .orderBy(desc(documents.updatedAt))
    .limit(limit + 1)
  const more = rows.length > limit
  const list = rows.slice(0, limit)
  const scope = [query && `with ${quote(query)}`, groupName && `in the group ${quote(groupName)}`, kind !== 'all' && `(${kind} only)`]
    .filter(Boolean).join(' ')
  if (!list.length) return `No notes found${scope ? ` ${scope}` : ''}.`

  const groups = await groupsOf(list.map((r) => r.id), userId)
  const lines = [`Notes${scope ? ` ${scope}` : ''}, newest change first:`]
  for (const r of list) {
    const inGroups = groups.get(r.id) ?? []
    lines.push(`- ${nameOf(r.title)} · note_id: ${r.id} · ${r.userId ? 'private' : 'public'} · changed ${timeText(r.updatedAt)}`
      + (inGroups.length ? ` · groups: ${inGroups.map((g) => quote(g.name)).join(', ')}` : ''))
  }
  if (more) lines.push(`There are more notes. Search with query, or ask for a bigger limit (up to 200).`)
  return lines.join('\n')
}

async function readNote(args: Args, caller: AiCaller): Promise<string> {
  const noteId = idOf(args, 'note_id', NOT_FOUND)
  const offset = whole(args, 'offset', { min: 0, max: 1_000_000_000, fallback: 0 })
  const maxChars = whole(args, 'max_chars', { min: 1000, max: 100_000, fallback: 40_000 })
  const userId = caller.user.id
  const [doc] = await useDb()
    .select()
    .from(documents)
    .where(and(eq(documents.id, noteId), viewableBy(userId)))
  if (!doc) throw new ToolError(NOT_FOUND)

  const { markdown } = noteAsMarkdown(doc.content)
  const groups = (await groupsOf([doc.id], userId)).get(doc.id) ?? []
  if (doc.userId === null || doc.userId === userId) remember(caller.keyId, doc.id, doc.updatedAt)

  const end = Math.min(markdown.length, offset + maxChars)
  const lines = [
    `Note ${nameOf(doc.title)}`,
    `- note_id: ${doc.id}`,
    `- ${kindText(doc.userId, userId)}`,
    `- updated_at: ${doc.updatedAt.toISOString()}`,
    `- groups: ${groups.length ? groups.map((g) => `${quote(g.name)} (group_id: ${g.id})`).join(', ') : 'none'}`,
    `- length: ${markdown.length} characters`,
  ]
  if (!markdown) {
    lines.push('', 'The note is empty.')
  } else if (offset >= markdown.length) {
    lines.push('', `The note has only ${markdown.length} characters, so there is nothing after offset ${offset}.`)
  } else {
    if (offset > 0 || end < markdown.length) lines.push(`- this part: characters ${offset} to ${end}`)
    lines.push('', '<note>', markdown.slice(offset, end), '</note>')
    if (end < markdown.length) lines.push(`The note goes on: read the rest with offset ${end}.`)
  }
  return lines.join('\n')
}

async function createNote(args: Args, caller: AiCaller): Promise<string> {
  const asked = text(args, 'title', { max: 200 })?.trim() ?? ''
  const markdown = text(args, 'content', { max: MAX_MARKDOWN }) ?? ''
  const isPrivate = yesNo(args, 'private', true)
  const userId = caller.user.id
  const db = useDb()

  const group = args.group_id !== undefined && args.group_id !== null ? await groupOf(args, 'group_id', userId) : null
  if (group) await checkRoom(group.id, 1)
  useDailyLimit('new-note', `user:${userId}`, MAX_NEW_NOTES_A_DAY, `You can make at most ${MAX_NEW_NOTES_A_DAY} new notes a day. Please try again tomorrow.`)

  const { doc: content, warnings } = markdownAsNote(markdown)
  // Like the app: a private note gets a name none of the user's notes has yet ("Plan", "Plan_2"…).
  const title = isPrivate ? await freeNoteTitle(userId, asked || 'Untitled') : (asked || 'Untitled')
  const made = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ id: randomUUID(), title, content, userId: isPrivate ? userId : null })
      .returning({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt })
    if (group) await tx.insert(groupNotes).values({ groupId: group.id, docId: doc!.id })
    return doc!
  })
  remember(caller.keyId, made.id, made.updatedAt)

  let answer = `Made the note ${nameOf(made.title)} (note_id: ${made.id}). It is ${isPrivate ? 'private: only the user can see it' : 'public: everyone who uses the app can see and change it'}.`
  if (group) answer += ` It is in the group ${quote(group.name)}.`
  if (asked && made.title !== asked) answer += ` (The user already has a note called ${quote(asked)}, so this one is called ${quote(made.title)}.)`
  return answer + warningsText(warnings)
}

interface Edit {
  oldText: string
  newText: string
  all: boolean
}

function editsOf(args: Args): Edit[] | undefined {
  const value = args.edits
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value) || value.length === 0) throw new ToolError('edits must be a list of { old_text, new_text }.')
  if (value.length > 50) throw new ToolError('edits can have at most 50 changes at a time.')
  return value.map((raw, i) => {
    const which = value.length > 1 ? ` (in edit ${i + 1})` : ''
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ToolError(`Each edit must be { old_text, new_text }${which}.`)
    const e = raw as Args
    const oldText = text(e, 'old_text', { max: MAX_MARKDOWN })
    const newText = text(e, 'new_text', { max: MAX_MARKDOWN })
    if (oldText === undefined || newText === undefined) throw new ToolError(`Each edit needs old_text and new_text${which}.`)
    if (!oldText) throw new ToolError(`old_text is empty${which}. To add something at the end of the note, use append.`)
    return { oldText, newText, all: yesNo(e, 'replace_all', false) }
  })
}

function applyEdits(markdown: string, edits: Edit[]): string {
  let out = markdown
  edits.forEach((e, i) => {
    const which = edits.length > 1 ? ` (edit ${i + 1})` : ''
    const times = out.split(e.oldText).length - 1
    if (times === 0) {
      throw new ToolError(`old_text was not found in the note${which}. Nothing was changed. Read the note again with read_note and copy the text exactly as it is there.`)
    }
    if (times > 1 && !e.all) {
      throw new ToolError(`old_text is in the note ${times} times${which}. Nothing was changed. Add more of the words around it so it is there only once, or use replace_all.`)
    }
    out = e.all ? out.split(e.oldText).join(e.newText) : out.replace(e.oldText, () => e.newText)
  })
  return out
}

async function editNote(args: Args, caller: AiCaller): Promise<string> {
  const noteId = idOf(args, 'note_id', NOT_EDITABLE)
  const newTitle = text(args, 'title', { max: 200 })
  const edits = editsOf(args)
  const append = text(args, 'append', { max: MAX_MARKDOWN })
  const content = text(args, 'content', { max: MAX_MARKDOWN })
  const ways = [edits, append, content].filter((x) => x !== undefined).length
  if (ways > 1) throw new ToolError('Use only one of edits, append and content at a time.')
  if (ways === 0 && newTitle === undefined) throw new ToolError('Nothing to change: give a title, edits, append or content.')
  const userId = caller.user.id
  const db = useDb()

  // The note is locked while it is changed, so a save from the app can't come in between.
  const result = await db.transaction(async (tx) => {
    const [doc] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.id, noteId), editableBy(userId)))
      .for('update')
    if (!doc) throw new ToolError(NOT_EDITABLE)

    const changes: Partial<NewDocument> = {}
    let warnings: string[] = []
    if (newTitle !== undefined) {
      const title = newTitle.trim().slice(0, 200) || 'Untitled'
      if (title !== doc.title) changes.title = title
    }
    if (ways) {
      const before = noteAsMarkdown(doc.content).markdown
      let markdown = before
      if (edits) markdown = applyEdits(before, edits)
      else if (append !== undefined) markdown = before.trim() ? `${before}\n\n${append}` : append
      else {
        if (!readThisVersion(caller.keyId, doc.id, doc.updatedAt)) {
          throw new ToolError('The note was changed after you last read it (or you have not read it yet), so it was not replaced. '
            + 'Read it again with read_note, then try again. Or use edits to change only some parts.')
        }
        markdown = content!
      }
      if (markdown !== before) {
        // The user's own note: its Daily tasks, so a task line that was taken out can come back.
        const noteTasks = doc.userId === userId
          ? (await tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(and(eq(tasks.docId, doc.id), eq(tasks.userId, userId)))).map((t) => t.id)
          : []
        const made = markdownAsNote(markdown, doc.content, noteTasks)
        warnings = made.warnings
        changes.content = made.doc
      }
    }
    if (Object.keys(changes).length === 0) return { doc, saved: null, warnings }

    changes.updatedAt = new Date()
    const [saved] = await tx
      .update(documents)
      .set(changes)
      .where(eq(documents.id, doc.id))
      .returning({ id: documents.id, title: documents.title, updatedAt: documents.updatedAt, userId: documents.userId })
    return { doc, saved: saved!, warnings, content: changes.content }
  })

  const { doc, saved, warnings } = result
  if (!saved) {
    remember(caller.keyId, doc.id, doc.updatedAt)
    return `Nothing changed: the note ${nameOf(doc.title)} already is like that.`
  }
  remember(caller.keyId, saved.id, saved.updatedAt)
  // People with the note open see "AI (key name) is editing this note" (server/utils/noteEditors.ts).
  // The name fits in the 40 characters kept there.
  markEditing(saved.id, `ai-${caller.keyId}`, { id: `ai:${userId}`, name: caller.user.name }, `AI (${clip(caller.keyName, 34)})`)

  let answer = `Saved ${nameOf(saved.title)} (note_id: ${saved.id}).`
  if (result.content) {
    answer += ` It now has ${noteAsMarkdown(result.content).markdown.length} characters of Markdown.`
    // The user's own private note: keep the Daily tasks list in step with the task lines.
    if (saved.userId === userId) {
      try {
        await syncNoteTasks(db, { docId: saved.id, userId, content: result.content })
      } catch (e) {
        console.error('[mcp] could not update the task lines of a note', hideQueryValues(e))
      }
      const after = noteTaskLines(result.content)
      const gone = [...noteTaskLines(doc.content)].filter(([id]) => !after.has(id))
      if (gone.length) {
        answer += `\nThese Daily task lines are not in the note any more, so their tasks are hidden from the task list: `
          + `${gone.map(([, line]) => quote(clip(line, 80))).join(', ')}. If that was a mistake, put the lines back with their <!-- task:… --> marks.`
      }
    }
  }
  return answer + warningsText(warnings)
}

// The code a delete needs: the AI gets it in the first step, and has to ask the user before it uses it.
const deleteCodes = new Map<string, { code: string; at: number }>()

async function deleteNote(args: Args, caller: AiCaller): Promise<string> {
  const noteId = idOf(args, 'note_id', NOT_EDITABLE)
  const code = text(args, 'confirm_code', { max: 40 })?.trim()
  const userId = caller.user.id
  const db = useDb()
  const [doc] = await db
    .select({ id: documents.id, title: documents.title, userId: documents.userId })
    .from(documents)
    .where(and(eq(documents.id, noteId), editableBy(userId)))
  if (!doc) throw new ToolError(NOT_EDITABLE)

  const now = Date.now()
  for (const [k, v] of deleteCodes) if (now - v.at > DELETE_CODE_MS) deleteCodes.delete(k)
  const key = `${caller.keyId}:${doc.id}`

  if (!code) {
    const newCode = String(randomInt(100_000, 1_000_000))
    deleteCodes.delete(key)
    deleteCodes.set(key, { code: newCode, at: now })
    if (deleteCodes.size > MAX_REMEMBERED) deleteCodes.delete(deleteCodes.keys().next().value!)
    return [
      'Not deleted yet.',
      `First ask the user if they want to delete the note ${nameOf(doc.title)}. Tell them it goes to the Trash, where it can be restored for 30 days.`,
      doc.userId === null ? 'Also tell them it is a public note: it goes away for everyone who uses the app.' : '',
      `Only if they say yes, call delete_note again with note_id ${doc.id} and confirm_code "${newCode}". The code works for 10 minutes.`,
    ].filter(Boolean).join('\n')
  }

  const pending = deleteCodes.get(key)
  if (!pending || pending.code !== code) {
    throw new ToolError('That confirm_code is wrong or too old, so the note was not deleted. Call delete_note without confirm_code to get a new code, and ask the user again.')
  }
  deleteCodes.delete(key)
  const [gone] = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(and(eq(documents.id, doc.id), editableBy(userId)))
    .returning({ id: documents.id })
  if (!gone) throw new ToolError(NOT_EDITABLE)
  return `Moved the note ${nameOf(doc.title)} to the Trash. The user can restore it there for 30 days.`
}

// ---- Groups ----

/** Notes the user can put in a group: their own and public notes, not in the Trash. */
async function usableNotes(ids: string[], userId: string) {
  if (!ids.length) return []
  return useDb()
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(and(inArray(documents.id, ids), editableBy(userId)))
}

/** Stop when the group would get too many notes. */
async function checkRoom(groupId: string, adding: number) {
  const [{ n } = { n: 0 }] = await useDb().select({ n: count() }).from(groupNotes).where(eq(groupNotes.groupId, groupId))
  if (n + adding > MAX_GROUP_NOTES) {
    throw new ToolError(`A group can have at most ${MAX_GROUP_NOTES} notes, and this one has ${n}.`)
  }
}

async function listGroups(_args: Args, caller: AiCaller): Promise<string> {
  const userId = caller.user.id
  const db = useDb()
  const groups = await db
    .select({ id: noteGroups.id, name: noteGroups.name, updatedAt: noteGroups.updatedAt })
    .from(noteGroups)
    .where(eq(noteGroups.userId, userId))
    .orderBy(sql`lower(${noteGroups.name})`, noteGroups.createdAt)
  if (!groups.length) return 'The user has no groups yet. You can make one with create_group.'

  const counts = await db
    .select({ groupId: groupNotes.groupId, n: count() })
    .from(groupNotes)
    .innerJoin(noteGroups, eq(noteGroups.id, groupNotes.groupId))
    .innerJoin(documents, eq(documents.id, groupNotes.docId))
    .where(and(eq(noteGroups.userId, userId), editableBy(userId)))
    .groupBy(groupNotes.groupId)
  const byGroup = new Map(counts.map((c) => [c.groupId, c.n]))
  return ['The user\'s groups:', ...groups.map((g) => `- ${quote(g.name)} · group_id: ${g.id} · ${plural(byGroup.get(g.id) ?? 0, 'note')}`)].join('\n')
}

async function readGroup(args: Args, caller: AiCaller): Promise<string> {
  const userId = caller.user.id
  const group = await groupOf(args, 'group_id', userId)
  const notes = await useDb()
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      userId: documents.userId,
      deletedAt: documents.deletedAt,
      // Only the start of the note: enough for its first words (server/utils/groups.ts).
      start: sql<string>`left(${documents.content}::text, 60000)`,
    })
    .from(groupNotes)
    .innerJoin(documents, eq(documents.id, groupNotes.docId))
    .where(and(eq(groupNotes.groupId, group.id), or(isNull(documents.userId), eq(documents.userId, userId))))
    .orderBy(groupNotes.addedAt)

  const live = notes.filter((n) => !n.deletedAt)
  const trashed = notes.filter((n) => n.deletedAt)
  const titles = new Map(notes.map((n) => [n.id, n.title]))
  const inTrash = new Set(trashed.map((n) => n.id))
  const cardName = (card: CardContent): string | null => {
    switch (card.kind) {
      case 'note': {
        // Cards of notes that are not in the group any more go away when the board is opened.
        if (!card.docId || !titles.has(card.docId)) return null
        return `note ${nameOf(titles.get(card.docId))}${inTrash.has(card.docId) ? ' (in the Trash, so not shown)' : ''}`
      }
      case 'text':
        return `${card.style === 'topic' ? 'topic' : 'text'} ${quote(clip(card.text ?? '', 300))}`
      case 'link':
        return `link ${card.text ? `${quote(card.text)} ` : ''}${card.url ?? ''}`.trim()
      case 'video':
        return `video ${card.text ? `${quote(card.text)} ` : ''}${card.url ?? ''}`.trim()
      case 'image':
        return `picture ${quote(card.text || card.fileName || 'picture')}`
      case 'file':
        return `file ${quote(card.text || card.fileName || 'file')}`
    }
  }

  const lines = [`Group ${quote(group.name)} (group_id: ${group.id})`, '']
  lines.push(live.length ? `Notes in it (${live.length}):` : 'There are no notes in it yet.')
  for (const n of live) {
    const words = previewFromJsonText(n.start ?? '', 160)
    lines.push(`- ${nameOf(n.title)} · note_id: ${n.id} · ${n.userId ? 'private' : 'public'} · changed ${timeText(n.updatedAt)}`
      + (words ? ` · starts with: ${quote(words)}` : ''))
  }
  if (trashed.length) lines.push(`In the Trash (they come back in the group if restored): ${trashed.map((n) => nameOf(n.title)).join(', ')}`)

  const board = cleanBoard(group.board)
  const shown = board.cards.map((c) => ({ id: c.id, name: cardName(c) })).filter((c): c is { id: string; name: string } => c.name !== null)
  const byId = new Map(shown.map((c) => [c.id, c.name]))
  const boardLines = board.lines.filter((l) => byId.has(l.from) && byId.has(l.to))
  lines.push('', `Mind map: ${plural(shown.length, 'card')}, ${plural(boardLines.length, 'line')}.`)
  for (const c of shown) lines.push(`- ${c.name}`)
  for (const l of boardLines) {
    lines.push(`- line: ${byId.get(l.from)} → ${byId.get(l.to)}${l.label ? ` (${quote(l.label)})` : ''}`)
  }

  const kanban = cleanKanban(group.kanban)
  if (!kanban.columns.length) {
    lines.push('', 'Kanban: not set up yet. It gets its columns the first time it is opened in the app.')
  } else {
    lines.push('', 'Kanban, columns from left to right:')
    for (const col of kanban.columns) {
      const cards = col.cards.map(cardName).filter((c): c is string => c !== null)
      lines.push(`- ${quote(col.name)}: ${cards.length ? cards.join('; ') : '(empty)'}`)
    }
  }
  lines.push('', 'You can\'t change the Mind map or the Kanban here, only which notes are in the group. '
    + 'A note put in the group gets a card on both boards when they are opened in the app.')
  return lines.join('\n')
}

async function createGroup(args: Args, caller: AiCaller): Promise<string> {
  const name = cleanGroupName(text(args, 'name', { required: true, max: 1000 }))
  if (!name) throw new ToolError('A group needs a name.')
  const ids = idsOf(args, 'note_ids')
  const userId = caller.user.id
  const db = useDb()
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(noteGroups).where(eq(noteGroups.userId, userId))
  if (n >= MAX_GROUPS) throw new ToolError(`The user can have at most ${MAX_GROUPS} groups.`)

  const found = await usableNotes(ids, userId)
  const group = await db.transaction(async (tx) => {
    const [g] = await tx.insert(noteGroups).values({ userId, name }).returning({ id: noteGroups.id, name: noteGroups.name })
    if (found.length) await tx.insert(groupNotes).values(found.map((d) => ({ groupId: g!.id, docId: d.id })))
    return g!
  })
  const missing = ids.filter((id) => !found.some((d) => d.id === id))
  let answer = `Made the group ${quote(group.name)} (group_id: ${group.id})`
  answer += found.length ? ` with ${plural(found.length, 'note')} in it: ${found.map((d) => nameOf(d.title)).join(', ')}.` : '.'
  if (missing.length) answer += `\nNot put in it (no such note that the user can use): ${missing.join(', ')}`
  return answer
}

async function renameGroup(args: Args, caller: AiCaller): Promise<string> {
  const userId = caller.user.id
  const group = await groupOf(args, 'group_id', userId)
  const name = cleanGroupName(text(args, 'name', { required: true, max: 1000 }))
  if (!name) throw new ToolError('A group needs a name.')
  await useDb()
    .update(noteGroups)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(noteGroups.id, group.id), eq(noteGroups.userId, userId)))
  return `Renamed the group ${quote(group.name)} to ${quote(name)}.`
}

async function addNotesToGroup(args: Args, caller: AiCaller): Promise<string> {
  const userId = caller.user.id
  const group = await groupOf(args, 'group_id', userId)
  const ids = idsOf(args, 'note_ids')
  if (!ids.length) throw new ToolError('note_ids is needed: the ids of the notes to put in the group.')
  const db = useDb()
  const found = await usableNotes(ids, userId)
  const already = new Set(found.length
    ? (await db
        .select({ docId: groupNotes.docId })
        .from(groupNotes)
        .where(and(eq(groupNotes.groupId, group.id), inArray(groupNotes.docId, found.map((d) => d.id))))).map((r) => r.docId)
    : [])
  const adding = found.filter((d) => !already.has(d.id))
  if (adding.length) {
    await checkRoom(group.id, adding.length)
    await db.insert(groupNotes).values(adding.map((d) => ({ groupId: group.id, docId: d.id }))).onConflictDoNothing()
  }
  const missing = ids.filter((id) => !found.some((d) => d.id === id))
  const lines = [adding.length
    ? `Put ${plural(adding.length, 'note')} in the group ${quote(group.name)}: ${adding.map((d) => nameOf(d.title)).join(', ')}.`
    : `No notes were put in the group ${quote(group.name)}.`]
  if (already.size) lines.push(`Already in it: ${found.filter((d) => already.has(d.id)).map((d) => nameOf(d.title)).join(', ')}.`)
  if (missing.length) lines.push(`Not found (no such note that the user can use): ${missing.join(', ')}`)
  return lines.join('\n')
}

async function removeNotesFromGroup(args: Args, caller: AiCaller): Promise<string> {
  const userId = caller.user.id
  const group = await groupOf(args, 'group_id', userId)
  const ids = idsOf(args, 'note_ids')
  if (!ids.length) throw new ToolError('note_ids is needed: the ids of the notes to take out of the group.')
  const removed = await useDb()
    .delete(groupNotes)
    .where(and(eq(groupNotes.groupId, group.id), inArray(groupNotes.docId, ids)))
    .returning({ docId: groupNotes.docId })
  if (!removed.length) return `None of these notes were in the group ${quote(group.name)}.`
  return `Took ${plural(removed.length, 'note')} out of the group ${quote(group.name)}. `
    + 'The notes themselves did not change, and they are still in the notes list.'
}
