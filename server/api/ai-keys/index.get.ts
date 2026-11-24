import { desc, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { aiKeys } from '../../../db/schema'

// Your keys for AI apps (the MCP connection): their names, first characters and when they were
// made and last used. Never the keys themselves (only their hash is kept).
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return await useDb()
    .select({
      id: aiKeys.id,
      name: aiKeys.name,
      keyStart: aiKeys.keyStart,
      createdAt: aiKeys.createdAt,
      lastUsedAt: aiKeys.lastUsedAt,
    })
    .from(aiKeys)
    .where(eq(aiKeys.userId, user.id))
    .orderBy(desc(aiKeys.createdAt))
})
