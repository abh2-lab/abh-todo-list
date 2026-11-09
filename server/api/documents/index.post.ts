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

  const db = useDb()
  const [doc] = await db
    .insert(documents)
    .values({
      id: randomUUID(),
      title: body.title ?? 'Untitled',
      content: body.content ?? {},
      userId,
    })
    .returning()
  return toClientDoc(doc!)
})
