import { desc } from 'drizzle-orm'
import { useDb } from '../../db'
import { documents } from '../../../db/schema'

// The Trash: deleted notes that can still be restored, newest first.
// Public notes in the Trash: everyone sees them. Private notes: only their owner.
export default defineEventHandler(async (event) => {
  const { user } = await getUserSession(event)
  const rows = await useDb()
    .select({
      id: documents.id,
      title: documents.title,
      userId: documents.userId,
      updatedAt: documents.updatedAt,
      deletedAt: documents.deletedAt,
    })
    .from(documents)
    .where(trashOf(user?.id))
    .orderBy(desc(documents.deletedAt))
  return rows.map(({ deletedAt, ...doc }) => ({
    ...toClientDoc(doc),
    deletedAt: deletedAt!,
    // When it is deleted for good.
    purgeAt: purgeTime(deletedAt!),
  }))
})
