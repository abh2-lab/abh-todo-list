import { eq, isNull, or, type SQL } from 'drizzle-orm'
import { documents, type Document } from '../../db/schema'

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

/** What the browser gets: we never send the owner id, only whether the note is private. */
export function toClientDoc<T extends Partial<Document>>(doc: T) {
  const { userId, ...rest } = doc
  return { ...rest, isPrivate: userId != null }
}
