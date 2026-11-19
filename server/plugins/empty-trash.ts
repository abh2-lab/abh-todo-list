import { lt } from 'drizzle-orm'
import { documents } from '../../db/schema'
import { useDb } from '../db'

// Notes stay in the Trash for 30 days (TRASH_DAYS in server/utils/notes.ts). After that they are
// deleted for good, with their tasks (the database deletes those together with the note).
// The server checks a little after it starts, then every hour.
const HOUR_MS = 60 * 60 * 1000

export default defineNitroPlugin((nitroApp) => {
  async function emptyOldTrash() {
    try {
      const before = new Date(Date.now() - TRASH_DAYS * 24 * HOUR_MS)
      const gone = await useDb()
        .delete(documents)
        .where(lt(documents.deletedAt, before))
        .returning({ id: documents.id })
      if (gone.length) console.log(`[trash] ${gone.length} note(s) were in the Trash for ${TRASH_DAYS} days: deleted for good`)
    } catch (e) {
      // We try again in an hour.
      console.error('[trash] could not delete the old notes in the Trash:', hideQueryValues(e))
    }
  }

  const first = setTimeout(emptyOldTrash, 30_000)
  const hourly = setInterval(emptyOldTrash, HOUR_MS)
  // The timers never keep the server running on their own.
  first.unref?.()
  hourly.unref?.()
  nitroApp.hooks.hook('close', () => {
    clearTimeout(first)
    clearInterval(hourly)
  })
})
