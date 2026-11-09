import { and, asc, between, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { tasks } from '../../../db/schema'

// Your tasks between two days, for the calendar: ?from=2026-10-26&to=2026-12-06
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const query = getQuery(event)
  const from = readDay(query.from, 'from')
  const to = readDay(query.to, 'to')
  return useDb()
    .select(taskColumns)
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), between(tasks.day, from, to)))
    .orderBy(asc(tasks.day), asc(tasks.createdAt))
})
