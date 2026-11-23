import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { noteGroups } from '../../../../db/schema'
import { cleanBoard } from '#shared/board'
import { cleanKanban } from '#shared/kanban'

// Change a group: { name } to rename it, { board, version } to save its Mind map,
// { kanban, kanbanVersion } to save its Kanban.
// A board is saved only if nobody saved it since its version number (another tab, for example).
// Otherwise the answer is 409 with the newer numbers, and the app loads the newer board.
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
    const version = versionNumber(body.version)
    changes.board = cleanBoard(body.board)
    changes.boardVersion = version + 1
    where = and(where, eq(noteGroups.boardVersion, version))
  }
  if (body.kanban !== undefined) {
    const version = versionNumber(body.kanbanVersion)
    changes.kanban = cleanKanban(body.kanban)
    changes.kanbanVersion = version + 1
    where = and(where, eq(noteGroups.kanbanVersion, version))
  }
  if (Object.keys(changes).length === 0) throw createError({ statusCode: 400, message: 'Nothing to change' })
  changes.updatedAt = new Date()

  const [group] = await db
    .update(noteGroups)
    .set(changes)
    .where(where)
    .returning({
      id: noteGroups.id,
      name: noteGroups.name,
      version: noteGroups.boardVersion,
      kanbanVersion: noteGroups.kanbanVersion,
      updatedAt: noteGroups.updatedAt,
    })
  if (group) return group

  // Nothing saved: the group is not yours (404), or a board was saved in between (409).
  const now = await ownGroup(user.id, id)
  throw createError({
    statusCode: 409,
    message: 'This board was changed somewhere else (another tab?).',
    data: { version: now.boardVersion, kanbanVersion: now.kanbanVersion },
  })
})

function versionNumber(value: unknown): number {
  const version = Number(value)
  // (A database integer can't be much bigger.)
  if (!Number.isInteger(version) || version < 0 || version > 2_000_000_000) throw createError({ statusCode: 400, message: 'version is needed' })
  return version
}
