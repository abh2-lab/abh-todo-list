import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event)
  const db = useDb()
  const [doc] = await db
    .update(documents)
    .set({
      ...(body.title !== undefined && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id))
    .returning()
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return doc
})
