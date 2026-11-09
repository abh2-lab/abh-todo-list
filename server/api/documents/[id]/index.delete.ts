import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await getUserSession(event)
  const db = useDb()
  const [doc] = await db
    .delete(documents)
    .where(and(eq(documents.id, id), editableBy(user?.id)))
    .returning({ id: documents.id })
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return { success: true }
})
