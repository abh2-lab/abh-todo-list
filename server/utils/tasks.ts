import { tasks } from '../../db/schema'

/** The task fields we send to the browser. */
export const taskColumns = {
  id: tasks.id,
  text: tasks.text,
  day: tasks.day,
  done: tasks.done,
  doneAt: tasks.doneAt,
  movedFrom: tasks.movedFrom,
  createdAt: tasks.createdAt,
}

/**
 * Read a day like 2026-11-09. The browser sends it, because "today" depends on
 * the person's own time zone, not the server's.
 */
export function readDay(value: unknown, name = 'day'): string {
  const s = String(value ?? '')
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  const date = m ? new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)) : null
  if (!m || !date || date.getUTCMonth() !== +m[2]! - 1 || date.getUTCDate() !== +m[3]!) {
    throw createError({ statusCode: 400, message: `${name} must be a day like 2026-11-09` })
  }
  return s
}

export function readTaskText(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'Write the task first' })
  if (text.length > 500) throw createError({ statusCode: 400, message: 'Task is too long (500 letters max)' })
  return text
}
