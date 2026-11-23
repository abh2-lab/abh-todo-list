import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { useDb } from '../../../db'
import { documents, groupNotes } from '../../../../db/schema'
import { cleanBoard } from '#shared/board'

// One group with its board, and the notes in it (name, first words, private or public).
// Notes in the Trash are listed with inTrash, so their cards keep their place on the board
// and come back if the note is restored.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const group = await ownGroup(user.id, getRouterParam(event, 'id')!)

  const rows = await useDb()
    .select({
      id: documents.id,
      title: documents.title,
      updatedAt: documents.updatedAt,
      userId: documents.userId,
      deletedAt: documents.deletedAt,
      // Only the start of the note: enough for its first words (server/utils/groups.ts).
      start: sql<string>`left(${documents.content}::text, 60000)`,
    })
    .from(groupNotes)
    .innerJoin(documents, eq(documents.id, groupNotes.docId))
    .where(and(
      eq(groupNotes.groupId, group.id),
      or(isNull(documents.userId), eq(documents.userId, user.id)),
    ))
    .orderBy(groupNotes.addedAt)

  return {
    id: group.id,
    name: group.name,
    version: group.boardVersion,
    board: cleanBoard(group.board),
    notes: rows.map((r) => ({
      id: r.id,
      title: r.title,
      updatedAt: r.updatedAt,
      isPrivate: r.userId != null,
      inTrash: r.deletedAt != null,
      preview: previewFromJsonText(r.start ?? ''),
    })),
  }
})
