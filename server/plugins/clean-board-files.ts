import { and, eq, inArray, isNotNull, isNull, lt, notInArray } from 'drizzle-orm'
import { boardFiles, noteGroups } from '../../db/schema'
import { useDb } from '../db'
import { cleanBoard } from '#shared/board'
import { cleanKanban, kanbanCards } from '#shared/kanban'

// Pictures and files that are not on their group's boards any more (the Mind map and the
// Kanban) are deleted after some days (UNUSED_FILE_DAYS in server/utils/boardFiles.ts).
// Until then Ctrl+Z can bring their card back.
// Files in the uploads folder that the database does not know (left from a deleted group, or
// from an upload that stopped in the middle) are deleted too.
// The server checks a minute after it starts, then every hour.
const HOUR_MS = 60 * 60 * 1000

async function markUnused() {
  const db = useDb()
  const groups = await db.selectDistinct({ id: boardFiles.groupId }).from(boardFiles)
  for (const { id } of groups) {
    const [group] = await db
      .select({ board: noteGroups.board, kanban: noteGroups.kanban })
      .from(noteGroups)
      .where(eq(noteGroups.id, id))
    if (!group) continue
    const cards = [...cleanBoard(group.board).cards, ...kanbanCards(cleanKanban(group.kanban))]
    const used = [...new Set(cards.flatMap((c) => (c.fileId ? [c.fileId] : [])))]
    // Off the boards: from now on. Back on a board (Ctrl+Z): not any more.
    await db
      .update(boardFiles)
      .set({ unusedSince: new Date() })
      .where(and(eq(boardFiles.groupId, id), isNull(boardFiles.unusedSince), used.length ? notInArray(boardFiles.id, used) : undefined))
    if (used.length) {
      await db
        .update(boardFiles)
        .set({ unusedSince: null })
        .where(and(eq(boardFiles.groupId, id), isNotNull(boardFiles.unusedSince), inArray(boardFiles.id, used)))
    }
  }
}

async function deleteOld() {
  const db = useDb()
  const before = new Date(Date.now() - UNUSED_FILE_DAYS * 24 * HOUR_MS)
  const gone = await db.delete(boardFiles).where(lt(boardFiles.unusedSince, before)).returning({ id: boardFiles.id })
  await removeBoardFiles(gone.map((f) => f.id))
  if (gone.length) console.log(`[files] ${gone.length} file(s) were off their boards for ${UNUSED_FILE_DAYS} days: deleted`)

  // Files the database does not know. Only ones older than an hour: a file is saved a moment
  // before its row, while it is being uploaded.
  const inFolder = await oldFilesInFolder(Date.now() - HOUR_MS)
  const strays: string[] = []
  for (let i = 0; i < inFolder.length; i += 500) {
    const ids = inFolder.slice(i, i + 500)
    const known = new Set((await db.select({ id: boardFiles.id }).from(boardFiles).where(inArray(boardFiles.id, ids))).map((r) => r.id))
    strays.push(...ids.filter((id) => !known.has(id)))
  }
  await removeBoardFiles(strays)
  if (strays.length) console.log(`[files] ${strays.length} file(s) in the uploads folder had no board: deleted`)
}

export default defineNitroPlugin((nitroApp) => {
  let running = false
  async function cleanBoardFiles() {
    if (running) return
    running = true
    try {
      await markUnused()
      await deleteOld()
    } catch (e) {
      // We try again in an hour.
      console.error('[files] could not clean up the board files:', hideQueryValues(e))
    } finally {
      running = false
    }
  }

  const first = setTimeout(cleanBoardFiles, 60_000)
  const hourly = setInterval(cleanBoardFiles, HOUR_MS)
  // The timers never keep the server running on their own.
  first.unref?.()
  hourly.unref?.()
  nitroApp.hooks.hook('close', () => {
    clearTimeout(first)
    clearInterval(hourly)
  })
})
