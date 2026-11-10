import { and, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { documents, tasks } from '../../../db/schema'

// Add a task: { text, day, id?, docId? }
// The "Today's task" button sends the note id, and an id it made itself:
// the note line keeps that same id, so the line and the task stay linked.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = (await readBody(event)) ?? {}
  const db = useDb()

  let docId: string | null = null
  if (body.docId != null) {
    docId = String(body.docId)
    // Only your own private notes can have task lines.
    const [doc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, docId), eq(documents.userId, user.id)))
    if (!doc) throw createError({ statusCode: 404, message: 'Note not found' })
  }

  const [task] = await db
    .insert(tasks)
    .values({
      ...(body.id != null ? { id: readTaskId(body.id) } : {}),
      userId: user.id,
      text: readTaskText(body.text),
      day: readDay(body.day),
      docId,
    })
    .onConflictDoNothing()
    .returning(taskColumns)
  if (!task) throw createError({ statusCode: 409, message: 'This task already exists' })
  return task
})
