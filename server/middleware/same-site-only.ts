// Only this app's own pages may change things (save, delete, share, tasks, log out).
// Browsers also send the login cookie with requests that come from other sites on the
// same main domain (like other-app.boomlive.in). If one of those sites were ever broken
// into, it could make a logged-in person's browser change their notes without them knowing.
// Browsers say where each request comes from (the Sec-Fetch-Site header), so we refuse
// changes that come from another site. Opening and reading pages is not affected.
export default defineEventHandler((event) => {
  if (event.method === 'GET' || event.method === 'HEAD' || event.method === 'OPTIONS') return
  // "same-origin" is this app. No header: not a browser (it has no one's login cookie).
  const from = getRequestHeader(event, 'sec-fetch-site')
  if (from === 'cross-site' || from === 'same-site') {
    throw createError({ statusCode: 403, message: 'Changes can only be made from this app.' })
  }
})
