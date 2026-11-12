import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'

// Who else is editing this note now (see server/utils/noteEditors.ts), and when it was last saved.
// The app asks every few seconds while a note is open: ?tab=<this tab's id>
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await getUserSession(event)
  const tab = readTab(getQuery(event).tab)
  const [doc] = await useDb()
    .select({ updatedAt: documents.updatedAt })
    .from(documents)
    .where(and(eq(documents.id, id), editableBy(user?.id)))
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })
  return { editors: otherEditors(id, tab, user?.id), updatedAt: doc.updatedAt }
})
