import { randomUUID } from 'node:crypto'
import { useDb } from '../../db'
import { documents } from '../../../db/schema'
import { cleanNoteContent } from '#shared/noteContent'

// Each person (account, or internet address when not logged in) can make this many new notes a day.
const MAX_NEW_NOTES_A_DAY = 100

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) ?? {}

  // A private note needs a login. Without "private" it is a public note, like before.
  let userId: string | null = null
  if (body.private) {
    const { user } = await requireUserSession(event)
    userId = user.id
  }

  // Anyone can send anything here, so keep only a cleaned copy of the note (shared/noteContent.ts).
  let content: object = {}
  if (body.content != null) {
    const cleaned = cleanNoteContent(body.content)
    if (!cleaned) throw createError({ statusCode: 400, message: 'content must be a note' })
    content = cleaned
  }

  const { user } = await getUserSession(event)
  useDailyLimit(
    'new-note',
    requesterKey(event, user?.id),
    MAX_NEW_NOTES_A_DAY,
    `You can make at most ${MAX_NEW_NOTES_A_DAY} new notes a day. Please try again tomorrow.`,
  )

  // The browser sends today's date as the name of a new private note, like "9 Nov 2026, Monday".
  let title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 200) : 'Untitled'
  // You already have a note with that name: call the new one "9 Nov 2026, Monday_2" (then _3, …).
  if (userId) title = await freeNoteTitle(userId, title)

  const db = useDb()
  const [doc] = await db
    .insert(documents)
    .values({
      id: randomUUID(),
      title,
      content,
      userId,
    })
    .returning()
  return toClientDoc(doc!)
})
