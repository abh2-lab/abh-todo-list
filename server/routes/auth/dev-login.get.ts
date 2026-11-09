import { users } from '../../../db/schema'
import { useDb } from '../../db'

// Test login for local development only (npm run dev), so private notes and
// tasks can be tested without Google. In the built app (Docker / live site)
// import.meta.dev is false, so this always answers "not found".
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })

  const db = useDb()
  const [user] = await db
    .insert(users)
    .values({ googleId: 'dev-test-user', email: 'test-user@localhost.test', name: 'Test user', avatar: null })
    .onConflictDoUpdate({ target: users.googleId, set: { name: 'Test user' } })
    .returning()
  await setUserSession(event, {
    user: { id: user!.id, name: user!.name, email: user!.email, avatar: user!.avatar },
  })
  return sendRedirect(event, '/')
})
