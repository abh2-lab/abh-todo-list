import { and, eq, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { documents, type Document } from '../../db/schema'
import { useDb } from '../db'

/** A note stays in the Trash this many days. Then it is deleted for good (server/plugins/empty-trash.ts). */
export const TRASH_DAYS = 30

/** All public notes, plus this person's own private notes (in the Trash or not). */
function publicOrOwn(userId: string | undefined): SQL {
  return userId
    ? or(isNull(documents.userId), eq(documents.userId, userId))!
    : isNull(documents.userId)
}

/** Notes that are not in the Trash. */
export function notInTrash(): SQL {
  return isNull(documents.deletedAt)
}

/** Notes this person can change: all public notes, plus their own private notes. Not the ones in the Trash. */
export function editableBy(userId: string | undefined): SQL {
  return and(notInTrash(), publicOrOwn(userId))!
}

/** Notes this person can read: the ones they can change, plus private notes shared with a link. Not the ones in the Trash. */
export function viewableBy(userId: string | undefined): SQL {
  return and(notInTrash(), or(publicOrOwn(userId), eq(documents.shared, true)))!
}

/**
 * Notes in the Trash this person can see, read and restore:
 * public notes (everyone can), plus their own private notes (only they can).
 */
export function trashOf(userId: string | undefined): SQL {
  return and(isNotNull(documents.deletedAt), publicOrOwn(userId))!
}

/** When a note in the Trash is deleted for good. */
export function purgeTime(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + TRASH_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * A name that none of this person's notes has yet:
 * "10 Nov 2026, Tuesday", then "10 Nov 2026, Tuesday_2", "…_3", and so on.
 */
export async function freeNoteTitle(userId: string, title: string): Promise<string> {
  const rows = await useDb()
    .select({ title: documents.title })
    .from(documents)
    .where(and(
      eq(documents.userId, userId),
      // only names that start with this one
      sql`left(${documents.title}, char_length(${title}::text)) = ${title}::text`,
    ))
  const taken = new Set(rows.map((r) => r.title))
  if (!taken.has(title)) return title
  let n = 2
  while (taken.has(`${title}_${n}`)) n++
  return `${title}_${n}`
}

/** What the browser gets: we never send the owner id, only whether the note is private. */
export function toClientDoc<T extends Partial<Document>>(doc: T) {
  const { userId, ...rest } = doc
  return { ...rest, isPrivate: userId != null }
}
