import { users } from '../../../db/schema'
import { useDb } from '../../db'

// Google sign-in. Google sends the person back here after they log in.
// The redirect URL to allow in Google Cloud is <site>/auth/google
export default defineOAuthGoogleEventHandler({
  async onSuccess(event, { user: g }) {
    const db = useDb()
    const values = {
      googleId: String(g.sub),
      email: String(g.email ?? ''),
      name: String(g.name ?? g.email ?? ''),
      avatar: g.picture ? String(g.picture) : null,
    }
    const [user] = await db
      .insert(users)
      .values(values)
      .onConflictDoUpdate({
        target: users.googleId,
        set: { email: values.email, name: values.name, avatar: values.avatar },
      })
      .returning()
    await setUserSession(event, {
      user: { id: user!.id, name: user!.name, email: user!.email, avatar: user!.avatar },
    })
    return sendRedirect(event, '/')
  },
  onError(event, error) {
    console.error('Google login failed:', error)
    return sendRedirect(event, '/?login=failed')
  },
})
