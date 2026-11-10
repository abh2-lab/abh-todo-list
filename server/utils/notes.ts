import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { documents, type Document } from '../../db/schema'
import { useDb } from '../db'

/** Notes this person can change: all public notes, plus their own private notes. */
export function editableBy(userId: string | undefined): SQL {
  return userId
    ? or(isNull(documents.userId), eq(documents.userId, userId))!
    : isNull(documents.userId)
}

/** Notes this person can read: the ones they can change, plus private notes shared with a link. */
export function viewableBy(userId: string | undefined): SQL {
  return or(editableBy(userId), eq(documents.shared, true))!
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
