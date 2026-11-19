import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'
import { and, eq } from 'drizzle-orm'

// Delete = move the note to the Trash. It can be restored for 30 days (/api/trash), then it is
// deleted for good (server/plugins/empty-trash.ts). Its tasks are hidden until then.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await getUserSession(event)
  const db = useDb()
  const [doc] = await db
    .update(documents)
    .set({ deletedAt: new Date() })
    .where(and(eq(documents.id, id), editableBy(user?.id)))
    .returning({ id: documents.id })
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return { success: true }
})
