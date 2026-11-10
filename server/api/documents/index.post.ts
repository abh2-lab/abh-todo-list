import { randomUUID } from 'node:crypto'
import { useDb } from '../../db'
import { documents } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) ?? {}

  // A private note needs a login. Without "private" it is a public note, like before.
  let userId: string | null = null
  if (body.private) {
    const { user } = await requireUserSession(event)
    userId = user.id
  }

  // The browser sends today's date as the name of a new private note, like "9 Nov 2026, Monday".
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled'

  const db = useDb()
  const [doc] = await db
    .insert(documents)
    .values({
      id: randomUUID(),
      title,
      content: body.content ?? {},
      userId,
    })
    .returning()
  return toClientDoc(doc!)
})
