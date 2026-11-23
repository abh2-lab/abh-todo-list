import { and, count, eq } from 'drizzle-orm'
import { useDb } from '../../../../db'
import { documents, groupNotes } from '../../../../../db/schema'

// Put a note in a group: { docId }. Only notes you can change: your own, or public notes.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const group = await ownGroup(user.id, getRouterParam(event, 'id')!)
  const body = (await readBody(event)) ?? {}
  const docId = typeof body.docId === 'string' ? body.docId : ''

  const db = useDb()
  const [doc] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, docId), editableBy(user.id)))
  if (!doc) throw createError({ statusCode: 404, message: 'Note not found' })

  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(groupNotes).where(eq(groupNotes.groupId, group.id))
  if (n >= MAX_GROUP_NOTES) {
    throw createError({ statusCode: 429, message: `A group can have at most ${MAX_GROUP_NOTES} notes.` })
  }

  await db.insert(groupNotes).values({ groupId: group.id, docId: doc.id }).onConflictDoNothing()
  return { ok: true }
})
