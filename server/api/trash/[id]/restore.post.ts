import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'

// Restore a note from the Trash: it is back in the notes list, with its tasks and its view-only link.
// Public notes: anyone can restore them. Private notes: only their owner.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await getUserSession(event)
  const [doc] = await useDb()
    .update(documents)
    .set({ deletedAt: null })
    .where(and(eq(documents.id, id), trashOf(user?.id)))
    .returning({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
      userId: documents.userId,
      shared: documents.shared,
    })
  if (!doc) throw createError({ statusCode: 404, message: 'This note is not in the Trash.' })
  return toClientDoc(doc)
})
