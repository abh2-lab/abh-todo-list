import { and, asc, between, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { tasks } from '../../../db/schema'

// Your tasks, two ways:
//   ?from=2026-10-26&to=2026-12-06  for the calendar (only tasks whose line is still in its note)
//   ?docId=…                        all tasks of one note, for the editor (it tags those lines)
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const query = getQuery(event)
  const db = useDb()

  if (query.docId !== undefined) {
    return db
      .select(taskColumns)
      .from(tasks)
      .where(and(eq(tasks.userId, user.id), eq(tasks.docId, String(query.docId))))
      .orderBy(asc(tasks.createdAt))
  }

  const from = readDay(query.from, 'from')
  const to = readDay(query.to, 'to')
  return db
    .select(taskColumns)
    .from(tasks)
    .where(and(eq(tasks.userId, user.id), eq(tasks.inNote, true), between(tasks.day, from, to)))
    .orderBy(asc(tasks.day), asc(tasks.createdAt))
})
