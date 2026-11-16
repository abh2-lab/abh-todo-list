import { and, eq, sql } from 'drizzle-orm'
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core'
import { useDb } from '../../../db'
import { tasks } from '../../../../db/schema'

// Change a task: { text?, done?, doneDay?, cancelled?, day? }
// A task is done, or cancelled, or neither (to do). Done takes the cancel off, and cancel takes the done off.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const body = (await readBody(event)) ?? {}
  if (body.done && body.cancelled) {
    throw createError({ statusCode: 400, message: 'A task can be done or cancelled, not both' })
  }

  const changes: PgUpdateSetSource<typeof tasks> = {}
  if (body.text !== undefined) changes.text = readTaskText(body.text)
  if (body.done !== undefined) {
    const done = Boolean(body.done)
    changes.done = done
    changes.doneAt = done ? new Date() : null
    changes.doneDay = done ? readDoneDay(body.doneDay) : null
    if (done) changes.cancelled = false
  }
  if (body.cancelled !== undefined) {
    const cancelled = Boolean(body.cancelled)
    changes.cancelled = cancelled
    if (cancelled) {
      changes.done = false
      changes.doneAt = null
      changes.doneDay = null
    }
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
