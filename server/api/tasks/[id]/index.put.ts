import { and, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { useDb } from '../../../db'
import { tasks } from '../../../../db/schema'

// Change a task: { text?, done?, day? }
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const body = (await readBody(event)) ?? {}

  const changes: PgUpdateSetSource<typeof tasks> = {}
  if (body.text !== undefined) changes.text = readTaskText(body.text)
  if (body.done !== undefined) {
    changes.done = Boolean(body.done)
    changes.doneAt = body.done ? new Date() : null
  }
  if (body.day !== undefined) {
    const day = readDay(body.day)
    changes.day = day
    // Keep the first planned day, to show "from 6 Nov". Moving it back clears it.
    changes.movedFrom = sql`nullif(coalesce(${tasks.movedFrom}, ${tasks.day}), ${day}::date)`
  }
  if (Object.keys(changes).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to change' })
  }
  changes.updatedAt = new Date()

  const [task] = await useDb()
    .update(tasks)
    .set(changes)
    .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
    .returning(taskColumns)
  if (!task) throw createError({ statusCode: 404, message: 'Task not found' })
  return task
})
