import { useDb } from '../../../db'
import { documents, type NewDocument } from '../../../../db/schema'
import { and, eq, sql, type SQL } from 'drizzle-orm'
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

  // The browser sends the time of the version it changed (the note's updatedAt when it got it).
  // If someone else saved after that, we don't write over their changes: we answer 409 and the
  // app asks the person what to do. force = they chose to save their version anyway.
  const base = changes.content !== undefined && !body.force ? readTime(body.base) : null
  let where = and(eq(documents.id, id), allowed)
  if (base) {
    // Same time, give or take less than a millisecond (the database keeps more digits than the browser).
    where = and(where, sql`abs(extract(epoch from (${documents.updatedAt} - ${base}::timestamp))) < 0.001`)
  }
  const tab = readTab(body.tab)

  const [doc] = await db
    .update(documents)
    .set(changes)
    .where(where)
    .returning({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      userId: documents.userId,
      shared: documents.shared,
    })
  if (!doc) {
    if (base) {
      const [now] = await db
        .select({ updatedAt: documents.updatedAt })
        .from(documents)
        .where(and(eq(documents.id, id), allowed))
      if (now) {
        throw createError({
          statusCode: 409,
          message: 'Someone else saved this note after you opened it.',
          data: { updatedAt: now.updatedAt, by: otherEditors(id, tab, user?.id)[0] ?? null },
        })
      }
    }
    throw createError({ statusCode: 404, message: 'Document not found' })
  }

  // Remember who is editing, so others get a warning (server/utils/noteEditors.ts).
  if (tab && (changes.content !== undefined || changes.title !== undefined)) markEditing(id, tab, user)

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

/** A time the browser sent back, like "2026-11-12T10:06:00.123Z"; null if it is not one. */
function readTime(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
