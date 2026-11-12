import { and, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { taskShares } from '../../../db/schema'

// "Stop sharing": the link stops working right away.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = readShareId(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 404, message: 'Link not found' })
  const [row] = await useDb()
    .delete(taskShares)
    .where(and(eq(taskShares.id, id), eq(taskShares.userId, user.id)))
    .returning({ id: taskShares.id })
  if (!row) throw createError({ statusCode: 404, message: 'Link not found' })
  return { ok: true }
})
