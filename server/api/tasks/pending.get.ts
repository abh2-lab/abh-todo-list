import { and, asc, eq, lt } from 'drizzle-orm'
import { useDb } from '../../db'
import { tasks } from '../../../db/schema'

// Pending tasks: their day is over and they are still not done (and not cancelled). ?today=2026-11-09
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const today = readDay(getQuery(event).today, 'today')
  return useDb()
    .select(taskColumns)
    .from(tasks)
    .where(and(
      eq(tasks.userId, user.id),
      eq(tasks.inNote, true),
      eq(tasks.done, false),
      eq(tasks.cancelled, false),
      lt(tasks.day, today),
    ))
    .orderBy(asc(tasks.day), asc(tasks.createdAt))
})
