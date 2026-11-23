// The board page (Mind map) uses Vue Flow: it works with "nodes" (our cards) and "edges"
// (our lines). These helpers turn the saved board (shared/board.ts) into nodes and edges,
// and back, and hold the colors and the sizes of the cards.
import type { InjectionKey, Ref } from 'vue'
import { MarkerType, type Edge, type GraphEdge, type GraphNode, type Node } from '@vue-flow/core'
import type { BoardCard, BoardColor, BoardData, BoardLine, Side } from '#shared/board'
import type { GroupNote } from '~/types/groups'

/** What the cards and lines of a board can ask the board page for. */
export interface BoardContext {
  /** The notes in the group (name, first words), by note id. */
  notes: Ref<Map<string, GroupNote>>
  /** The text card being written in, if any. */
  editingId: Ref<string | null>
  /** The line whose words are being written, if any. */
  editingLineId: Ref<string | null>
  /** Show a note in the reading panel. */
  read: (docId: string) => void
  /** Text card: start writing in it, or save what was written (null = no change). */
  editText: (id: string) => void
  doneText: (id: string, text: string | null) => void
  /** Line: start writing its words, or save them (null = no change). */
  editLabel: (id: string) => void
  doneLabel: (id: string, label: string | null) => void
  /** Select a line (a click on its words). */
  selectLine: (id: string) => void
  /** A card was made wider or narrower (or bigger, for pictures). */
  resized: (id: string, size: { w: number; h?: number }) => void
}

export const BOARD_CONTEXT: InjectionKey<BoardContext> = Symbol('board')

/** The colors of cards and lines (dark theme). "gray" is the normal look. */
export const COLORS: Record<BoardColor, { name: string; border: string; bg: string; line: string }> = {
  gray: { name: 'Gray', border: '#2a2a2a', bg: '#0d0d0d', line: '#5b5b66' },
  indigo: { name: 'Indigo', border: '#6366f1', bg: '#13132a', line: '#818cf8' },
  sky: { name: 'Blue', border: '#0ea5e9', bg: '#0a1a24', line: '#38bdf8' },
  emerald: { name: 'Green', border: '#10b981', bg: '#09201a', line: '#34d399' },
  amber: { name: 'Yellow', border: '#f59e0b', bg: '#241a07', line: '#fbbf24' },
  rose: { name: 'Red', border: '#f43f5e', bg: '#260b12', line: '#fb7185' },
  violet: { name: 'Purple', border: '#8b5cf6', bg: '#1a1029', line: '#a78bfa' },
}

/** Normal card widths, in board pixels. */
export const CARD_WIDTH: Record<BoardCard['kind'], number> = {
  note: 260,
  text: 220,
  link: 260,
  video: 320,
  image: 280,
  file: 260,
}

export function colorOf(color: BoardColor | undefined) {
  return COLORS[color ?? 'gray']
}

/** A card as a Vue Flow node. The card itself is the node's data. */
export function cardToNode(card: BoardCard): Node<BoardCard> {
  const style: Record<string, string> = { width: `${card.w ?? CARD_WIDTH[card.kind]}px` }
  if (card.h) style.height = `${card.h}px`
  return {
    id: card.id,
    type: card.kind,
    position: { x: card.x, y: card.y },
    data: { ...card },
    style,
  }
}

/** A node back as a card, with its place on the board now. */
export function nodeToCard(node: GraphNode<BoardCard> | Node<BoardCard>): BoardCard {
  return { ...(node.data as BoardCard), id: node.id, x: Math.round(node.position.x), y: Math.round(node.position.y) }
}

export function lineMarker(line: Pick<BoardLine, 'arrow' | 'color'>) {
  return line.arrow === false ? undefined : { type: MarkerType.ArrowClosed, color: colorOf(line.color).line, width: 18, height: 18 }
}

/** A line as a Vue Flow edge. Its settings (label, arrow, dashed, color) are the edge's data. */
export function lineToEdge(line: BoardLine): Edge<BoardLine> {
  return {
    id: line.id,
    type: 'board',
    source: line.from,
    target: line.to,
    sourceHandle: line.fromSide ?? null,
    targetHandle: line.toSide ?? null,
    data: { ...line },
    markerEnd: lineMarker(line),
  }
}

export function edgeToLine(edge: GraphEdge<BoardLine> | Edge<BoardLine>): BoardLine {
  const line: BoardLine = { ...(edge.data ?? {}), id: edge.id, from: edge.source, to: edge.target } as BoardLine
  if (edge.sourceHandle) line.fromSide = edge.sourceHandle as Side
  else delete line.fromSide
  if (edge.targetHandle) line.toSide = edge.targetHandle as Side
  else delete line.toSide
  return line
}

/** A copy that shares nothing with the board on the screen (for undo). */
export function copyBoard(board: BoardData): BoardData {
  return JSON.parse(JSON.stringify(board)) as BoardData
}

/**
 * Places for new note cards: below the cards that are already there, four in a row.
 * On an empty board: a grid around the middle.
 */
export function placesForNew(count: number, cards: BoardCard[]): { x: number; y: number }[] {
  const stepX = 300
  const stepY = 190
  const perRow = 4
  let x0 = 0
  let y0 = 0
  if (cards.length) {
    x0 = Math.min(...cards.map((c) => c.x))
    y0 = Math.max(...cards.map((c) => c.y + (c.h ?? 140))) + 100
  } else {
    const cols = Math.min(perRow, count)
    x0 = -((cols - 1) * stepX) / 2
  }
  return Array.from({ length: count }, (_, i) => ({ x: x0 + (i % perRow) * stepX, y: y0 + Math.floor(i / perRow) * stepY }))
}
