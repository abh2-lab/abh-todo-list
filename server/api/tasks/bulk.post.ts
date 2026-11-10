import { and, eq, inArray } from 'drizzle-orm'
import { useDb } from '../../db'
import { tasks } from '../../../db/schema'

// Many tasks at once: { ids: [...], action: 'done' | 'delete' }
// Delete only takes tasks off the list. Their lines stay in the notes as normal text.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = (await readBody(event)) ?? {}
  const ids: string[] = Array.isArray(body.ids) ? body.ids.map(String) : []
  if (ids.length === 0 || ids.length > 500) {
    throw createError({ statusCode: 400, message: 'Choose between 1 and 500 tasks' })
  }
  const mine = and(inArray(tasks.id, ids), eq(tasks.userId, user.id))
  const db = useDb()

  if (body.action === 'done') {
    const now = new Date()
    const rows = await db
      .update(tasks)
      .set({ done: true, doneAt: now, updatedAt: now })
      .where(and(mine, eq(tasks.done, false)))
      .returning({ id: tasks.id })
    return { count: rows.length }
  }

  if (body.action === 'delete') {
    const rows = await db.delete(tasks).where(mine).returning({ id: tasks.id })
    return { count: rows.length }
  }

  throw createError({ statusCode: 400, message: 'action must be "done" or "delete"' })
})
