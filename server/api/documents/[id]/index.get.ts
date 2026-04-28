import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const [doc] = await db.select().from(documents).where(eq(documents.id, id))
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return doc
})
