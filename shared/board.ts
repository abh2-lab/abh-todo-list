// The board of a group (a Mind map): cards, and lines between them.
// It is saved as one piece of JSON (note_groups.board). Like notes, it comes from the browser,
// so the server keeps only a cleaned copy (cleanBoard): known kinds of cards, plain values,
// safe web addresses, and sizes within limits. The app cleans what it loads the same way.

import { isSafeLinkHref, youtubeSrc } from './noteContent'
import { withoutNul } from './text'

/** The kinds of cards on a board. */
export const CARD_KINDS = ['note', 'text', 'link', 'video', 'image', 'file'] as const
export type CardKind = typeof CARD_KINDS[number]

/** Card and line colors. "gray" is the normal look. */
export const BOARD_COLORS = ['gray', 'indigo', 'sky', 'emerald', 'amber', 'rose', 'violet'] as const
export type BoardColor = typeof BOARD_COLORS[number]

/** Where a line starts or ends on a card. */
export const SIDES = ['top', 'right', 'bottom', 'left'] as const
export type Side = typeof SIDES[number]

export interface BoardCard {
  id: string
  kind: CardKind
  /** Top-left corner, in board pixels. */
  x: number
  y: number
  /** Size in board pixels, when the card was resized. */
  w?: number
  h?: number
  color?: BoardColor
  /** note: which note. */
  docId?: string
  /** text: the words. link and video: a name for it. */
  text?: string
  /** text: "topic" = big and bold (like the middle of a mind map). */
  style?: 'topic'
  /** link and video: the web address. */
  url?: string
  /** image and file: the uploaded file and what it is. */
  fileId?: string
  fileName?: string
  fileType?: string
  fileSize?: number
}

export interface BoardLine {
  id: string
  from: string
  to: string
  fromSide?: Side
  toSide?: Side
  /** A word or two on the line, like "causes" or "part of". */
  label?: string
  /** An arrow at the end (on by default). */
  arrow?: boolean
  dashed?: boolean
  color?: BoardColor
}

export interface BoardData {
  cards: BoardCard[]
  lines: BoardLine[]
}

export const MAX_CARDS = 500
export const MAX_LINES = 1000
export const MAX_TEXT = 5000
export const MAX_LABEL = 200
export const MAX_URL = 2000
export const MAX_FILE_NAME = 200
const MAX_POS = 1_000_000
const ID = /^[\w-]{1,64}$/
const FILE_TYPE = /^[\w.+-]{1,60}\/[\w.+-]{1,100}$/

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanId(value: unknown): string | null {
  return typeof value === 'string' && ID.test(value) ? value : null
}

function cleanText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  return withoutNul(value).slice(0, max)
}

function cleanPos(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(-MAX_POS, Math.min(MAX_POS, Math.round(n))) : 0
}

function cleanSize(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) && n >= 40 && n <= 4000 ? Math.round(n) : undefined
}

function cleanColor(value: unknown): BoardColor | undefined {
  return BOARD_COLORS.includes(value as BoardColor) && value !== 'gray' ? (value as BoardColor) : undefined
}

function cleanSide(value: unknown): Side | undefined {
  return SIDES.includes(value as Side) ? (value as Side) : undefined
}

/** A web page address for a link card (http or https), or null. */
export function cleanWebAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let s = withoutNul(value).trim()
  if (!s || s.length > MAX_URL) return null
  // People often leave out "https://" (like "example.com/page").
  if (!/^[a-z][a-z\d+.-]*:/i.test(s)) s = `https://${s.replace(/^\/+/, '')}`
  if (!isSafeLinkHref(s)) return null
  try {
    const url = new URL(s)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.href : null
  } catch {
    return null
  }
}

function cleanCard(value: unknown): BoardCard | null {
  if (!isObject(value)) return null
  const id = cleanId(value.id)
  const kind = CARD_KINDS.includes(value.kind as CardKind) ? (value.kind as CardKind) : null
  if (!id || !kind) return null

  const card: BoardCard = { id, kind, x: cleanPos(value.x), y: cleanPos(value.y) }
  const w = cleanSize(value.w)
  const h = cleanSize(value.h)
  if (w) card.w = w
  if (h) card.h = h
  const color = cleanColor(value.color)
  if (color) card.color = color

  switch (kind) {
    case 'note': {
      const docId = cleanId(value.docId)
      if (!docId) return null
      card.docId = docId
      break
    }
    case 'text':
      card.text = cleanText(value.text, MAX_TEXT) ?? ''
      if (value.style === 'topic') card.style = 'topic'
      break
    case 'link': {
      const url = cleanWebAddress(value.url)
      if (!url) return null
      card.url = url
      const name = cleanText(value.text, MAX_LABEL)?.trim()
      if (name) card.text = name
      break
    }
    case 'video': {
      const url = youtubeSrc(value.url)
      if (!url || url.length > MAX_URL) return null
      card.url = url
      const name = cleanText(value.text, MAX_LABEL)?.trim()
      if (name) card.text = name
      break
    }
    case 'image':
    case 'file': {
      const fileId = cleanId(value.fileId)
      if (!fileId) return null
      card.fileId = fileId
      card.fileName = cleanText(value.fileName, MAX_FILE_NAME) || 'file'
      if (typeof value.fileType === 'string' && FILE_TYPE.test(value.fileType)) card.fileType = value.fileType
      const size = Number(value.fileSize)
      if (Number.isInteger(size) && size >= 0 && size < 1e12) card.fileSize = size
      break
    }
  }
  return card
}

function cleanLine(value: unknown, cardIds: Set<string>): BoardLine | null {
  if (!isObject(value)) return null
  const id = cleanId(value.id)
  const from = cleanId(value.from)
  const to = cleanId(value.to)
  // A line needs two different cards that are on the board.
  if (!id || !from || !to || from === to || !cardIds.has(from) || !cardIds.has(to)) return null
  const line: BoardLine = { id, from, to }
  const fromSide = cleanSide(value.fromSide)
  const toSide = cleanSide(value.toSide)
  if (fromSide) line.fromSide = fromSide
  if (toSide) line.toSide = toSide
  const label = cleanText(value.label, MAX_LABEL)?.trim()
  if (label) line.label = label
  if (value.arrow === false) line.arrow = false
  if (value.dashed === true) line.dashed = true
  const color = cleanColor(value.color)
  if (color) line.color = color
  return line
}

/** A cleaned copy of a board (see the top of this file). Anything that is not a board gives an empty one. */
export function cleanBoard(value: unknown): BoardData {
  const board: BoardData = { cards: [], lines: [] }
  if (!isObject(value)) return board

  const cardIds = new Set<string>()
  const noteCards = new Set<string>()
  for (const raw of Array.isArray(value.cards) ? value.cards : []) {
    if (board.cards.length >= MAX_CARDS) break
    const card = cleanCard(raw)
    if (!card || cardIds.has(card.id)) continue
    // One card per note.
    if (card.docId) {
      if (noteCards.has(card.docId)) continue
      noteCards.add(card.docId)
    }
    cardIds.add(card.id)
    board.cards.push(card)
  }

  const lineIds = new Set<string>()
  for (const raw of Array.isArray(value.lines) ? value.lines : []) {
    if (board.lines.length >= MAX_LINES) break
    const line = cleanLine(raw, cardIds)
    if (!line || lineIds.has(line.id)) continue
    lineIds.add(line.id)
    board.lines.push(line)
  }
  return board
}

/** A new id for a card or a line. */
export function newBoardId(): string {
  return crypto.randomUUID()
}
