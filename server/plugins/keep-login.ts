// Keep people logged in while they use the app.
// The browser keeps the login cookie for 90 days from the last time we send it
// (runtimeConfig.session.cookie.maxAge in nuxt.config.ts). The app asks
// /api/_auth/session each time it opens, and then we send the cookie again, so the
// 90 days start again. Only someone who does not open the app for 90 days has to
// log in again. (This also gives the 90 days to people who logged in before.)
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user) return // not logged in
    try {
      // Saving the session (with nothing new in it) sends the cookie again.
      await setUserSession(event, {})
    } catch (e) {
      console.error('Could not renew the login cookie:', e)
    }
  })
})
