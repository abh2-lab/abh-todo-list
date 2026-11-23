import { and, eq } from 'drizzle-orm'
import { noteGroups } from '../../db/schema'
import { useDb } from '../db'
import { withoutNul } from '#shared/text'

/** One person can have this many groups. */
export const MAX_GROUPS = 200
/** A group can hold this many notes (the most cards a board can have, shared/board.ts). */
export const MAX_GROUP_NOTES = 500
const MAX_GROUP_NAME = 100

/** A group name without extra spaces (at most 100 characters), or null when it is empty. */
export function cleanGroupName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = withoutNul(value).replace(/\s+/g, ' ').trim().slice(0, MAX_GROUP_NAME).trim()
  return name || null
}

/** The group, if it is this person's. Otherwise "not found" (we don't tell others which groups exist). */
export async function ownGroup(userId: string, groupId: string) {
  const [group] = await useDb()
    .select()
    .from(noteGroups)
    .where(and(eq(noteGroups.id, groupId), eq(noteGroups.userId, userId)))
  if (!group) throw createError({ statusCode: 404, message: 'Group not found' })
  return group
}

/**
 * The first words of a note, for its card on a board. Read from the start of the saved note
 * (the note as JSON text, cut after some kilobytes), so a note with big pasted pictures is
 * never read whole: we take the "text" parts of the editor JSON in order.
 */
export function previewFromJsonText(jsonText: string, max = 240): string {
  let out = ''
  const re = /"text":"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(jsonText)) && out.length < max) {
    try {
      out += `${JSON.parse(`"${m[1]}"`)} `
    } catch {
      // A broken piece (cut in the middle): skip it.
    }
  }
  out = out.replace(/\s+/g, ' ').trim()
  return out.length > max ? `${out.slice(0, max - 1).trimEnd()}…` : out
}
