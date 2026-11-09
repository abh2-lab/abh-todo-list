import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { tasks } from '../../../../db/schema'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const [task] = await useDb()
    .delete(tasks)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning({ id: tasks.id })
  if (!task) throw createError({ statusCode: 404, message: 'Task not found' })
  return { success: true }
})
