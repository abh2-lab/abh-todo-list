import { and, eq } from 'drizzle-orm'
import { tasks } from '../../db/schema'
import type { useDb } from '../db'

/** The task fields we send to the browser. */
export const taskColumns = {
  id: tasks.id,
  text: tasks.text,
  day: tasks.day,
  done: tasks.done,
  doneAt: tasks.doneAt,
  movedFrom: tasks.movedFrom,
  docId: tasks.docId,
  createdAt: tasks.createdAt,
}

/**
 * Read a day like 2026-11-09. The browser sends it, because "today" depends on
 * the person's own time zone, not the server's.
 */
export function readDay(value: unknown, name = 'day'): string {
  const s = String(value ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const date = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null
  if (!m || !date || date.getUTCMonth() !== +m[2]! - 1 || date.getUTCDate() !== +m[3]!) {
    throw createError({ statusCode: 400, message: `${name} must be a day like 2026-11-09` })
  }
  return s
}

export function readTaskText(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'Write the task first' })
  if (text.length > 500) throw createError({ statusCode: 400, message: 'Task is too long (500 letters max)' })
  return text
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A task id made by the browser (the note line keeps the same id). */
export function readTaskId(value: unknown): string {
  const s = String(value ?? '')
  if (!ID_RE.test(s)) throw createError({ statusCode: 400, message: 'Bad task id' })
  return s.toLowerCase()
}

// ---- Task lines inside a note ----

/** Note lines that can be a task. List items count as one line (their first paragraph). */
const LINE_TYPES = new Set(['paragraph', 'listItem', 'taskItem'])
const MAX_TEXT = 500

interface JsonNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
}

function inlineText(node: JsonNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return ' '
  return (node.content ?? []).map(inlineText).join('')
}

/** The text of a task line, as the list shows it. */
export function lineText(node: JsonNode): string {
  const own = node.type === 'paragraph' ? node : node.content?.[0]
  return inlineText(own).replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

/** All task lines of a note (TipTap JSON): task id → its text. The first line wins if an id shows twice. */
export function noteTaskLines(content: unknown): Map<string, string> {
  const found = new Map<string, string>()
  const walk = (node: JsonNode | undefined) => {
    if (!node || typeof node !== 'object') return
    const id = node.attrs?.taskId
    if (typeof id === 'string' && node.type && LINE_TYPES.has(node.type) && !found.has(id)) {
      found.set(id, lineText(node))
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(content as JsonNode)
  return found
}

/**
 * After a private note is saved: make its tasks match the lines.
 * - Text changes in the note show in the list (the done/day/history stay).
 * - A line that was deleted hides its task; if the line comes back, so does the task.
 * Returns how many tasks changed.
 */
export async function syncNoteTasks(
  db: ReturnType<typeof useDb>,
  opts: { docId: string; userId: string; content: unknown },
): Promise<number> {
  const rows = await db
    .select({ id: tasks.id, text: tasks.text, inNote: tasks.inNote })
    .from(tasks)
    .where(and(eq(tasks.docId, opts.docId), eq(tasks.userId, opts.userId)))
  if (rows.length === 0) return 0

  const lines = noteTaskLines(opts.content)
  let changed = 0
  for (const row of rows) {
    const text = lines.get(row.id)
    const inNote = text !== undefined
    const newText = inNote ? text : row.text
    if (inNote === row.inNote && newText === row.text) continue
    await db
      .update(tasks)
      .set({ inNote, text: newText, updatedAt: new Date() })
      .where(eq(tasks.id, row.id))
    changed++
  }
  return changed
}
