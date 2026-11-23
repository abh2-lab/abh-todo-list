// The Kanban board of a group: columns (like "To learn", "Learning", "Done") with cards in
// them, top to bottom. The cards are the same kinds as on the Mind map (shared/board.ts), only
// without a place and a size: the column and the order say where they are.
// It is saved as one piece of JSON (note_groups.kanban) and cleaned like the Mind map.

import { MAX_CARDS, cleanCardContent, cleanColor, cleanId, cleanText, isObject, type BoardColor, type CardContent } from './board'

export interface KanbanColumn {
  id: string
  name: string
  color?: BoardColor
  /** Top to bottom. */
  cards: CardContent[]
}

export interface KanbanData {
  /** Left to right. */
  columns: KanbanColumn[]
}

export const MAX_COLUMNS = 20
export const MAX_COLUMN_NAME = 60

/** The columns of a new Kanban (they can be renamed, moved and deleted). */
export const DEFAULT_COLUMNS: readonly { name: string; color?: BoardColor }[] = [
  { name: 'To learn' },
  { name: 'Learning', color: 'amber' },
  { name: 'Done', color: 'emerald' },
]

/** A column name without extra spaces (at most MAX_COLUMN_NAME characters), or '' when it is empty. */
export function cleanColumnName(value: unknown): string {
  return (cleanText(value, 1000) ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_COLUMN_NAME).trim()
}

/**
 * A cleaned copy of a Kanban. At most MAX_COLUMNS columns and MAX_CARDS cards in all, every id
 * once, and one card per note. Anything that is not a Kanban gives one with no columns.
 */
export function cleanKanban(value: unknown): KanbanData {
  const kanban: KanbanData = { columns: [] }
  if (!isObject(value) || !Array.isArray(value.columns)) return kanban

  const ids = new Set<string>()
  const noteCards = new Set<string>()
  let cardCount = 0
  for (const raw of value.columns) {
    if (kanban.columns.length >= MAX_COLUMNS) break
    if (!isObject(raw)) continue
    const id = cleanId(raw.id)
    if (!id || ids.has(id)) continue
    ids.add(id)

    const column: KanbanColumn = { id, name: cleanColumnName(raw.name) || 'Column', cards: [] }
    const color = cleanColor(raw.color)
    if (color) column.color = color
    for (const rawCard of Array.isArray(raw.cards) ? raw.cards : []) {
      if (cardCount >= MAX_CARDS) break
      const card = cleanCardContent(rawCard)
      if (!card || ids.has(card.id)) continue
      // One card per note.
      if (card.docId) {
        if (noteCards.has(card.docId)) continue
        noteCards.add(card.docId)
      }
      ids.add(card.id)
      column.cards.push(card)
      cardCount++
    }
    kanban.columns.push(column)
  }
  return kanban
}

/** All the cards of a Kanban, column after column. */
export function kanbanCards(kanban: KanbanData): CardContent[] {
  return kanban.columns.flatMap((c) => c.cards)
}
