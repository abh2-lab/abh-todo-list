import { count, eq, sum } from 'drizzle-orm'
import { useDb } from '../../../../db'
import { boardFiles } from '../../../../../db/schema'
import { MAX_FILE_BYTES, MAX_FILE_MB } from '#shared/board'

// Upload a picture or a file for a group's board: one file, sent as form data ("file").
// The answer is what the card needs: { id, name, type, size }. The app then puts the card on
// the board and saves the board as usual.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const group = await ownGroup(user.id, getRouterParam(event, 'id')!)

  const parts = await readMultipartFormData(event)
  const part = parts?.find((p) => p.name === 'file' && p.filename !== undefined)
  if (!part) throw createError({ statusCode: 400, message: 'No file was sent.' })
  const data = part.data
  if (data.length === 0) throw createError({ statusCode: 400, message: 'This file is empty.' })
  if (data.length > MAX_FILE_BYTES) {
    throw createError({ statusCode: 413, message: `Too big: a file can be at most ${MAX_FILE_MB} MB.` })
  }

  const db = useDb()
  const [mine] = await db.select({ bytes: sum(boardFiles.size) }).from(boardFiles).where(eq(boardFiles.userId, user.id))
  if (Number(mine?.bytes ?? 0) + data.length > MAX_USER_FILE_BYTES) {
    throw createError({
      statusCode: 413,
      message: 'Your files on boards take up all the room there is for you (2 GB). Take some off your boards first: they are deleted a week later.',
    })
  }
  const [onBoard] = await db.select({ n: count() }).from(boardFiles).where(eq(boardFiles.groupId, group.id))
  if ((onBoard?.n ?? 0) >= MAX_GROUP_FILES) {
    throw createError({ statusCode: 413, message: `A board can have at most ${MAX_GROUP_FILES} files.` })
  }
  useDailyLimit('board-file', requesterKey(event, user.id), MAX_FILES_PER_DAY, `You uploaded ${MAX_FILES_PER_DAY} files today, the most for one day. Try again tomorrow.`)

  const file = {
    id: crypto.randomUUID(),
    name: cleanFileName(part.filename),
    type: boardFileType(data, part.type),
    size: data.length,
  }
  try {
    await saveBoardFile(file.id, data)
  } catch (e) {
    console.error(`[files] could not save a file in ${uploadsDir()}:`, (e as Error).message)
    throw createError({ statusCode: 500, message: 'The file could not be saved on the server.' })
  }
  try {
    await db.insert(boardFiles).values({ ...file, userId: user.id, groupId: group.id })
  } catch (e) {
    // The group was deleted in between, or the database is away: the file is not kept.
    await removeBoardFiles([file.id])
    throw e
  }
  return file
})
