import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { boardFiles, noteGroups } from '../../../../db/schema'

// Delete a group and its board, with the pictures and files on it.
// The notes in it are not touched: they stay in your notes list.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const db = useDb()
  const files = await db
    .select({ id: boardFiles.id })
    .from(boardFiles)
    .where(and(eq(boardFiles.groupId, id), eq(boardFiles.userId, user.id)))
  // The database deletes the group's rows in board_files with it.
  const deleted = await db
    .delete(noteGroups)
    .where(and(eq(noteGroups.id, id), eq(noteGroups.userId, user.id)))
    .returning({ id: noteGroups.id })
  if (deleted.length === 0) throw createError({ statusCode: 404, message: 'Group not found' })
  // A file uploaded at this very moment is not in the list: the cleanup deletes it later.
  await removeBoardFiles(files.map((f) => f.id))
  return { ok: true }
})
