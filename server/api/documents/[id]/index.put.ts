import { useDb } from '../../../db'
import { documents, type NewDocument } from '../../../../db/schema'
import { and, eq, type SQL } from 'drizzle-orm'
import { cleanNoteContent } from '#shared/noteContent'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = (await readBody(event)) ?? {}
  const { user } = await getUserSession(event)
  const db = useDb()

  const changes: Partial<NewDocument> = {}
  if (body.title !== undefined) changes.title = String(body.title).slice(0, 200)
  if (body.content !== undefined) {
    // Anyone can send anything here (public notes), so keep only a cleaned copy (shared/noteContent.ts).
    const cleaned = cleanNoteContent(body.content)
    if (!cleaned) throw createError({ statusCode: 400, message: 'content must be a note' })
    changes.content = cleaned
  }
  if (changes.title !== undefined || changes.content !== undefined) changes.updatedAt = new Date()

  // Public notes and your own private notes can be changed...
  let allowed: SQL = editableBy(user?.id)
  if (body.shared !== undefined) {
    // ...but only the owner can turn the view-only link of a private note on or off.
    if (!user) throw createError({ statusCode: 401, message: 'Log in first' })
    changes.shared = Boolean(body.shared)
    allowed = eq(documents.userId, user.id)
  }
  if (Object.keys(changes).length === 0) {
    throw createError({ statusCode: 400, message: 'Nothing to change' })
  }

  const [doc] = await db
    .update(documents)
    .set(changes)
    .where(and(eq(documents.id, id), allowed))
    .returning({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      userId: documents.userId,
      shared: documents.shared,
    })
  if (!doc) throw createError({ statusCode: 404, message: 'Document not found' })

  // Your private note was saved: keep the Daily tasks list in step with its task lines.
  let tasksChanged = false
  if (changes.content !== undefined && user && doc.userId === user.id) {
    try {
      tasksChanged = (await syncNoteTasks(db, { docId: doc.id, userId: user.id, content: changes.content })) > 0
    } catch (e) {
      // The note itself is saved; the list catches up on the next save.
      console.error('[tasks] could not update the task lines of a note', e)
    }
  }
  return { ...toClientDoc(doc), tasksChanged }
})
