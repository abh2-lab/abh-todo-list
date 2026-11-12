import { desc, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { taskShares } from '../../../db/schema'

// Your share links for Daily tasks, newest first.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const rows = await useDb()
    .select()
    .from(taskShares)
    .where(eq(taskShares.userId, user.id))
    .orderBy(desc(taskShares.createdAt))
  return rows.map(toClientShare)
})
