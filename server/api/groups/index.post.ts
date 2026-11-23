import { and, count, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { documents, groupNotes, noteGroups } from '../../../db/schema'

// Make a new group: { name, docId? }. With docId, that note goes into the new group right away.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const name = cleanGroupName(body.name)
  if (!name) throw createError({ statusCode: 400, message: 'A group needs a name.' })

  const db = useDb()
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(noteGroups).where(eq(noteGroups.userId, user.id))
  if (n >= MAX_GROUPS) {
    throw createError({ statusCode: 429, message: `You can have at most ${MAX_GROUPS} groups.` })
  }

  // The note to put in it must be one you can change (your own, or a public note).
  const docId = typeof body.docId === 'string' ? body.docId : null
  if (docId) {
    const [doc] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, docId), editableBy(user.id)))
    if (!doc) throw createError({ statusCode: 404, message: 'Note not found' })
  }

  const group = await db.transaction(async (tx) => {
    const [g] = await tx
      .insert(noteGroups)
      .values({ userId: user.id, name })
      .returning({ id: noteGroups.id, name: noteGroups.name, updatedAt: noteGroups.updatedAt })
    if (docId) await tx.insert(groupNotes).values({ groupId: g!.id, docId })
    return g!
  })
  return { ...group, noteIds: docId ? [docId] : [] }
})
