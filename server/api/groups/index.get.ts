import { and, eq, sql } from 'drizzle-orm'
import { useDb } from '../../db'
import { documents, groupNotes, noteGroups } from '../../../db/schema'

// Your groups, for the notes list: their names and which notes are in them.
// Notes in the Trash are left out (they come back when restored).
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const db = useDb()
  const groups = await db
    .select({ id: noteGroups.id, name: noteGroups.name, updatedAt: noteGroups.updatedAt })
    .from(noteGroups)
    .where(eq(noteGroups.userId, user.id))
    .orderBy(sql`lower(${noteGroups.name})`, noteGroups.createdAt)
  if (groups.length === 0) return []

  const members = await db
    .select({ groupId: groupNotes.groupId, docId: groupNotes.docId })
    .from(groupNotes)
    .innerJoin(noteGroups, eq(noteGroups.id, groupNotes.groupId))
    .innerJoin(documents, eq(documents.id, groupNotes.docId))
    .where(and(eq(noteGroups.userId, user.id), editableBy(user.id)))
    .orderBy(groupNotes.addedAt)

  const byGroup = new Map<string, string[]>()
  for (const m of members) {
    const list = byGroup.get(m.groupId) ?? []
    list.push(m.docId)
    byGroup.set(m.groupId, list)
  }
  return groups.map((g) => ({ ...g, noteIds: byGroup.get(g.id) ?? [] }))
})
