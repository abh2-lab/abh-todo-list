import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { noteGroups } from '../../../../db/schema'

// Delete a group and its board. The notes in it are not touched: they stay in your notes list.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const deleted = await useDb()
    .delete(noteGroups)
    .where(and(eq(noteGroups.id, id), eq(noteGroups.userId, user.id)))
    .returning({ id: noteGroups.id })
  if (deleted.length === 0) throw createError({ statusCode: 404, message: 'Group not found' })
  return { ok: true }
})
