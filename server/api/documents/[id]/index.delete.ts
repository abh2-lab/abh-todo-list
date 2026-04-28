import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const [doc] = await db.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id })
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return { success: true }
})
