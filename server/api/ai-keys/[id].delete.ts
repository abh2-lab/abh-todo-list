import { and, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { aiKeys } from '../../../db/schema'

// Delete a key: the AI app that has it can't reach your notes any more.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const [row] = await useDb()
    .delete(aiKeys)
    .where(and(eq(aiKeys.id, id), eq(aiKeys.userId, user.id)))
    .returning({ id: aiKeys.id })
  if (!row) throw createError({ statusCode: 404, message: 'Key not found' })
  return { ok: true }
})
