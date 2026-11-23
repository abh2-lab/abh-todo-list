import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../../db'
import { groupNotes } from '../../../../../db/schema'

// Take a note out of a group. The note itself is not touched.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const group = await ownGroup(user.id, getRouterParam(event, 'id')!)
  const docId = getRouterParam(event, 'docId')!
  await useDb()
    .delete(groupNotes)
    .where(and(eq(groupNotes.groupId, group.id), eq(groupNotes.docId, docId)))
  return { ok: true }
})
