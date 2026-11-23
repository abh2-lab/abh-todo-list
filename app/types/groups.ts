import type { BoardData } from '#shared/board'

/** A group in the notes list (only its owner sees it). */
export interface GroupMeta {
  id: string
  name: string
  updatedAt: string
  /** The notes in it, not the ones in the Trash. */
  noteIds: string[]
}

/** A note on a board. */
export interface GroupNote {
  id: string
  title: string
  updatedAt: string
  isPrivate: boolean
  /** In the Trash: its card is hidden until the note is restored. */
  inTrash: boolean
  /** Its first words. */
  preview: string
}

/** A group with its board, for the board page. */
export interface FullGroup {
  id: string
  name: string
  /** The board's save number (see PUT /api/groups/<id>). */
  version: number
  board: BoardData
  notes: GroupNote[]
}
