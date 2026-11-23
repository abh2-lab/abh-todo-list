import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { noteGroups } from '../../../../db/schema'
import { cleanBoard } from '#shared/board'

// Change a group: { name } to rename it, { board, version } to save its board.
// The board is saved only if nobody saved it since `version` (another tab, for example).
// Otherwise the answer is 409 with the newer version, and the app loads the newer board.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const body = (await readBody(event)) ?? {}
  const db = useDb()

  const changes: Partial<typeof noteGroups.$inferInsert> = {}
  if (body.name !== undefined) {
    const name = cleanGroupName(body.name)
    if (!name) throw createError({ statusCode: 400, message: 'A group needs a name.' })
    changes.name = name
  }

  let where = and(eq(noteGroups.id, id), eq(noteGroups.userId, user.id))
  if (body.board !== undefined) {
    const version = Number(body.version)
    if (!Number.isInteger(version) || version < 0) throw createError({ statusCode: 400, message: 'version is needed' })
    changes.board = cleanBoard(body.board)
    changes.boardVersion = version + 1
    where = and(where, eq(noteGroups.boardVersion, version))
  }
  if (Object.keys(changes).length === 0) throw createError({ statusCode: 400, message: 'Nothing to change' })
  changes.updatedAt = new Date()

  const [group] = await db
    .update(noteGroups)
    .set(changes)
    .where(where)
    .returning({ id: noteGroups.id, name: noteGroups.name, version: noteGroups.boardVersion, updatedAt: noteGroups.updatedAt })
  if (group) return group

  // Nothing saved: the group is not yours (404), or the board was saved in between (409).
  const now = await ownGroup(user.id, id)
  throw createError({
    statusCode: 409,
    message: 'This board was changed somewhere else (another tab?).',
    data: { version: now.boardVersion },
  })
})
