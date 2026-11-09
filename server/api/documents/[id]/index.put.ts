import { useDb } from '../../../db'
import { documents, type NewDocument } from '../../../../db/schema'
import { and, eq, type SQL } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = (await readBody(event)) ?? {}
  const { user } = await getUserSession(event)
  const db = useDb()

  const changes: Partial<NewDocument> = {}
  if (body.title !== undefined) changes.title = String(body.title)
  if (body.content !== undefined) changes.content = body.content
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
  return toClientDoc(doc)
})
