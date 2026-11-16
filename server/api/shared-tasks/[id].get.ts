import { and, asc, between, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { taskShares, tasks, users } from '../../../db/schema'

// The page behind a Daily tasks share link (/shared/tasks/<id>). No login needed: the link is the key.
// It shows only the task text, its day, whether it is done or cancelled, and the day it was done
// (never the time). Not which note it came from.
export default defineEventHandler(async (event) => {
  const notFound = () => createError({ statusCode: 404, message: 'This link does not work any more.' })
  const id = readShareId(getRouterParam(event, 'id'))
  if (!id) throw notFound()

  const db = useDb()
  const [share] = await db
    .select({
      userId: taskShares.userId,
      fromMonth: taskShares.fromMonth,
      toMonth: taskShares.toMonth,
      name: users.name,
    })
    .from(taskShares)
    .innerJoin(users, eq(users.id, taskShares.userId))
    .where(eq(taskShares.id, id))
  if (!share) throw notFound()

  const rows = await db
    .select({
      text: tasks.text,
      day: tasks.day,
      done: tasks.done,
      cancelled: tasks.cancelled,
      movedFrom: tasks.movedFrom,
      doneDay: tasks.doneDay,
      doneAt: tasks.doneAt,
    })
    .from(tasks)
    .where(and(
      eq(tasks.userId, share.userId),
      eq(tasks.inNote, true),
      between(tasks.day, share.fromMonth, monthEnd(share.toMonth)),
    ))
    .orderBy(asc(tasks.day), asc(tasks.createdAt))

  // The page is only for people with the link: don't keep a copy anywhere on the way.
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return {
    name: firstName(share.name),
    from: share.fromMonth.slice(0, 7),
    to: share.toMonth.slice(0, 7),
    // Only the day a task was done, not the time. Tasks done before the day was saved: the day in UTC.
    tasks: rows.map(({ doneAt, ...t }) => ({
      ...t,
      doneDay: t.done ? (t.doneDay ?? doneAt?.toISOString().slice(0, 10) ?? null) : null,
    })),
  }
})
