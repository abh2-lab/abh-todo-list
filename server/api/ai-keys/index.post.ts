import { count, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { aiKeys } from '../../../db/schema'

// Make a key for an AI app: { name }. The answer has the key itself: it is shown this once.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const name = cleanKeyName(body.name)
  if (!name) throw createError({ statusCode: 400, message: 'A key needs a name.' })

  useDailyLimit('ai-key', `user:${user.id}`, 30, 'You can make at most 30 keys a day. Please try again tomorrow.')
  const db = useDb()
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(aiKeys).where(eq(aiKeys.userId, user.id))
  if (n >= MAX_AI_KEYS) {
    throw createError({ statusCode: 429, message: `You can have at most ${MAX_AI_KEYS} keys. Delete one you don't use first.` })
  }

  const made = newAiKey()
  const [row] = await db
    .insert(aiKeys)
    .values({ userId: user.id, name, keyHash: made.hash, keyStart: made.start })
    .returning({
      id: aiKeys.id,
      name: aiKeys.name,
      keyStart: aiKeys.keyStart,
      createdAt: aiKeys.createdAt,
      lastUsedAt: aiKeys.lastUsedAt,
    })
  return { ...row!, key: made.key }
})
