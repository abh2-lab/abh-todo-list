import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await getUserSession(event)
  const db = useDb()
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), viewableBy(user?.id)))
  // Same answer for "does not exist" and "private": we don't tell strangers which ids exist.
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return toClientDoc(doc)
})
