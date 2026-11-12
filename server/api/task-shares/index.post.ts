import { randomUUID } from 'node:crypto'
import { count, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { taskShares } from '../../../db/schema'

// A new share link for your Daily tasks: { from: "2026-09", to: "2026-12" }
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const fromMonth = readMonth(body.from, 'from')
  const toMonth = readMonth(body.to, 'to')
  if (toMonth < fromMonth) {
    throw createError({ statusCode: 400, message: 'The last month must be the same as the first month, or after it.' })
  }
  if (monthsBetween(fromMonth, toMonth) > MAX_SHARE_MONTHS) {
    throw createError({ statusCode: 400, message: `One link can show at most ${MAX_SHARE_MONTHS} months.` })
  }

  const db = useDb()
  const [mine] = await db.select({ n: count() }).from(taskShares).where(eq(taskShares.userId, user.id))
  if ((mine?.n ?? 0) >= MAX_SHARES) {
    throw createError({ statusCode: 400, message: `You can have at most ${MAX_SHARES} links. Stop sharing an old one first.` })
  }

  const [row] = await db
    .insert(taskShares)
    .values({ id: randomUUID(), userId: user.id, fromMonth, toMonth })
    .returning()
  return toClientShare(row!)
})
