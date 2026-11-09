import { useDb } from '../../db'
import { documents } from '../../../db/schema'
import { desc } from 'drizzle-orm'

// List of notes: all public notes, plus your own private notes when logged in.
export default defineEventHandler(async (event) => {
  const { user } = await getUserSession(event)
  const db = useDb()
  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      createdAt: documents.createdAt,
      userId: documents.userId,
      shared: documents.shared,
    })
    .from(documents)
    .where(editableBy(user?.id))
    .orderBy(desc(documents.updatedAt))
  return rows.map(toClientDoc)
})
