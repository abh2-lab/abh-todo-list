// Note content is TipTap JSON, and it can come from anyone: public notes can be
// changed without a login, and the server keeps what it is sent. So we clean it
// before it is saved (server) and before it is shown (app):
// - links, pictures and videos keep only safe addresses (never "javascript:" and the like)
// - links always open in a new tab and look like our links: the target, rel and
//   class saved in a note are not used (a saved class could cover the whole page)
// - sizes, table column widths and code languages keep only plain values
// - settings (attrs) keep only plain values, and keys like "__proto__" are dropped
// - the invisible "null" character is taken out of all text (shared/text.ts): a task
//   line with it could not be saved to the Daily tasks list
// Everything else stays as it is.

import { withoutNul } from './text'

export interface NoteMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface NoteNode {
  type: string
  attrs?: Record<string, unknown>
  content?: NoteNode[]
  marks?: NoteMark[]
  text?: string
}

/** The rel every link gets: the new tab cannot reach back into this page. */
export const LINK_REL = 'noopener noreferrer nofollow'

// The same kinds of links the editor lets you make.
const LINK_PROTOCOLS = new Set(['http:', 'https:', 'ftp:', 'ftps:', 'mailto:', 'tel:', 'callto:', 'sms:', 'cid:', 'xmpp:'])
const YOUTUBE_HOST = /^(?:(?:www|m|music)\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i
const IMAGE_DATA = /^data:image\/[\w.+-]+[;,]/i
const CSS_SIZE = /^\d{1,5}(?:\.\d{1,4})?(?:px|%)$/
const CODE_LANGUAGE = /^[\w#+.-]{1,40}$/
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const MAX_DEPTH = 100

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The protocol of an address the way a browser reads it ("https:" for a link inside this site), or "" if it is not an address. */
function protocolOf(address: string): string {
  try {
    return new URL(address, 'https://this-site.invalid/').protocol
  } catch {
    return ''
  }
}

/** Is this a note: TipTap JSON with type "doc"? */
export function isNoteDoc(value: unknown): value is NoteNode {
  return isObject(value) && value.type === 'doc'
}

/** A link address that is safe to open: web, mail and phone links, or a link inside this site. */
export function isSafeLinkHref(href: unknown): href is string {
  return typeof href === 'string' && href.trim() !== '' && LINK_PROTOCOLS.has(protocolOf(href))
}

/** A picture or video address: a web address, a pasted picture (data:image/…), or a file on this site. */
export function isSafeMediaSrc(src: unknown): src is string {
  if (typeof src !== 'string' || src.trim() === '') return false
  const protocol = protocolOf(src)
  return protocol === 'http:' || protocol === 'https:' || (protocol === 'data:' && IMAGE_DATA.test(src.trim()))
}

/**
 * A YouTube address with "https://" in front, or null if it is not a YouTube address.
 * People often leave out "https://" (like "youtu.be/abc"). The editor library accepts
 * that, but then fails to show it and the whole editor stops working, so we add it.
 */
export function youtubeSrc(src: unknown): string | null {
  if (typeof src !== 'string' || src.trim() === '') return null
  let s = src.trim()
  if (s.startsWith('//')) s = `https:${s}`
  else if (!/^[a-z][a-z\d+.-]*:/i.test(s)) s = `https://${s}`
  try {
    const url = new URL(s)
    return (url.protocol === 'https:' || url.protocol === 'http:') && YOUTUBE_HOST.test(url.hostname) ? s : null
  } catch {
    return null
  }
}

export function isSafeYoutubeSrc(src: unknown): src is string {
  return youtubeSrc(src) !== null
}

/** A plain setting value (text, number, yes/no, empty), or undefined to drop it. */
function plainValue(value: unknown): string | number | boolean | null | undefined {
  if (typeof value === 'string') return withoutNul(value)
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  return undefined
}

function cssSize(value: unknown): string | number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 && value <= 100000 ? value : null
  return typeof value === 'string' && CSS_SIZE.test(value) ? value : null
}

function cellSpan(value: unknown): number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 1000 ? (value as number) : 1
}

function columnWidths(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const ok = value.every((w) => typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 100000)
  return ok ? (value as number[]) : null
}

function cleanAttrs(type: string, attrs: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (isObject(attrs)) {
    for (const [key, value] of Object.entries(attrs)) {
      if (BAD_KEYS.has(key)) continue
      const v = key === 'colwidth' ? columnWidths(value) : plainValue(value)
      if (v !== undefined) out[key] = v
    }
  }
  switch (type) {
    case 'link':
      out.target = '_blank'
      out.rel = LINK_REL
      out.class = null
      break
    case 'image':
    case 'youtube':
      if ('width' in out) out.width = cssSize(out.width)
      if ('height' in out) out.height = cssSize(out.height)
      break
    case 'codeBlock':
      if ('language' in out && !(typeof out.language === 'string' && CODE_LANGUAGE.test(out.language))) out.language = null
      break
    case 'tableCell':
    case 'tableHeader':
      if ('colspan' in out) out.colspan = cellSpan(out.colspan)
      if ('rowspan' in out) out.rowspan = cellSpan(out.rowspan)
      break
  }
  return out
}

function cleanMark(mark: unknown): NoteMark | null {
  if (!isObject(mark) || typeof mark.type !== 'string') return null
  const out: NoteMark = { type: mark.type }
  if (mark.attrs !== undefined) out.attrs = cleanAttrs(mark.type, mark.attrs)
  // A link with an unsafe address is dropped; its text stays as normal text.
  if (mark.type === 'link' && !isSafeLinkHref(out.attrs?.href)) return null
  return out
}

function cleanNode(node: unknown, depth: number): NoteNode | null {
  if (!isObject(node) || typeof node.type !== 'string' || depth > MAX_DEPTH) return null
  const out: NoteNode = { type: node.type }
  if (node.attrs !== undefined) out.attrs = cleanAttrs(node.type, node.attrs)
  if (node.type === 'text') {
    const text = typeof node.text === 'string' ? withoutNul(node.text) : ''
    if (text === '') return null
    out.text = text
  }
  // A picture or video with an unsafe address is dropped. YouTube addresses get "https://".
  if (node.type === 'image' && !isSafeMediaSrc(out.attrs?.src)) return null
  if (node.type === 'youtube') {
    const src = youtubeSrc(out.attrs?.src)
    if (!src) return null
    out.attrs!.src = src
  }
  if (Array.isArray(node.content)) {
    out.content = node.content.map((child) => cleanNode(child, depth + 1)).filter((c): c is NoteNode => c !== null)
  }
  if (Array.isArray(node.marks)) {
    out.marks = node.marks.map(cleanMark).filter((m): m is NoteMark => m !== null)
  }
  return out
}

/** A cleaned copy of a note (see the top of this file), or null when it is not a note. */
export function cleanNoteContent(content: unknown): NoteNode | null {
  return isNoteDoc(content) ? cleanNode(content, 0) : null
}
