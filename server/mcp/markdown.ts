// Notes as Markdown for AI apps (the MCP connection, server/routes/mcp.ts), and Markdown back
// into notes (TipTap JSON).
//
// - Each top-level part of a note (a paragraph, a heading, a list, a table…) is one piece of
//   Markdown, with an empty line between pieces. When an AI app sends Markdown back, each piece
//   it did not change keeps the exact part it came from (with all its settings, like picture
//   sizes or table column widths). Only changed or new pieces are made from the Markdown.
// - Pictures pasted into a note are big, so the AI sees them as ![name](picture:1a2b3c4d). The
//   placeholder keeps the picture when the AI sends it back, and the read_picture tool shows the
//   AI the picture itself (server/mcp/tools.ts). Pictures from the web keep their address.
//   YouTube videos look like @[youtube](https://…).
// - A line that is a Daily task ends with <!-- task:<id> -->, so the line stays linked to its
//   task when the AI changes the line.
// - An empty line in a note is <br> on a line of its own.
// - A new line inside a paragraph is a line break (Shift+Enter in the editor). An empty line
//   inside a paragraph is a line with just \ on it (a really empty line would end the paragraph).

import { createHash } from 'node:crypto'
import { cleanNoteContent, isSafeLinkHref, youtubeSrc, type NoteMark, type NoteNode } from '#shared/noteContent'

/** A note as Markdown: one piece per top-level part of the note. */
export interface NoteMarkdown {
  blocks: { md: string; node: NoteNode }[]
  markdown: string
}

/** What a note had before an AI changed it: pieces to keep, pictures, and task lines. */
interface OldNote {
  /** a piece of Markdown → the parts it came from (the same piece can be there twice) */
  pieces: Map<string, NoteNode[]>
  /** picture:<key> → the picture as it was saved */
  pictures: Map<string, NoteNode>
  /** web address → the picture or video with it (to keep its size) */
  media: Map<string, NoteNode>
  taskIds: Set<string>
}

const MAX_DEPTH = 40
/** Task ids are uuids (server/utils/tasks.ts). */
const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// =========================================================================================
// Note → Markdown

/** The short name of a pasted picture: the first 8 hex digits of a hash of it. */
export function pictureKey(src: string): string {
  return createHash('sha256').update(src).digest('hex').slice(0, 8)
}

export function noteAsMarkdown(content: unknown): NoteMarkdown {
  const doc = cleanNoteContent(content)
  const blocks = (doc?.content ?? []).map((node) => ({ md: blockMd(node), node }))
  return { blocks, markdown: blocks.map((b) => b.md).join('\n\n') }
}

/** The pasted pictures of a note (not the ones from a web address), by the key the AI sees: picture:<key>. */
export function pastedPictures(content: unknown): Map<string, NoteNode> {
  const out = new Map<string, NoteNode>()
  const walk = (node: NoteNode) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src.trim() : ''
    if (node.type === 'image' && src && !/^https?:\/\//i.test(src)) {
      const key = pictureKey(src)
      if (!out.has(key)) out.set(key, node)
    }
    for (const child of node.content ?? []) walk(child)
  }
  const doc = cleanNoteContent(content)
  if (doc) walk(doc)
  return out
}

function taskMark(node: NoteNode): string {
  const id = node.attrs?.taskId
  return typeof id === 'string' && TASK_ID.test(id) ? ` <!-- task:${id} -->` : ''
}

function plainText(node: NoteNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(plainText).join('')
}

const isList = (node: NoteNode) => node.type === 'bulletList' || node.type === 'orderedList' || node.type === 'taskList'

function listStart(node: NoteNode): number {
  const n = Number(node.attrs?.start)
  return Number.isInteger(n) && n >= 0 && n < 1e9 ? n : 1
}

function blockMd(node: NoteNode): string {
  switch (node.type) {
    case 'paragraph': {
      const text = inlineMd(node.content)
      return (text.trim() ? text : '<br>') + taskMark(node)
    }
    case 'heading': {
      const level = Number(node.attrs?.level)
      const hashes = '#'.repeat(Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
      // A # at the end would be read as the end of the heading.
      const text = inlineMd(node.content, { oneLine: true }).trim().replace(/(^|[ \t])(#+)$/, '$1\\$2')
      return text ? `${hashes} ${text}` : hashes
    }
    case 'blockquote': {
      const inner = (node.content ?? []).map(blockMd).join('\n\n')
      return inner.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n')
    }
    case 'codeBlock': {
      const code = plainText(node)
      const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((s) => s.length))
      const fence = '`'.repeat(longest + 1)
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : ''
      return `${fence}${language}\n${code}\n${fence}`
    }
    case 'horizontalRule':
      return '---'
    case 'bulletList':
      return (node.content ?? []).map((item) => itemMd(item, '- ', 2)).join('\n')
    case 'taskList':
      return (node.content ?? []).map((item) => itemMd(item, `- [${item.attrs?.checked ? 'x' : ' '}] `, 2)).join('\n')
    case 'orderedList': {
      const start = listStart(node)
      return (node.content ?? []).map((item, i) => {
        const marker = `${start + i}. `
        return itemMd(item, marker, marker.length)
      }).join('\n')
    }
    case 'image':
      return imageMd(node)
    case 'youtube': {
      const src = youtubeSrc(node.attrs?.src)
      return src ? `@[youtube](${mdAddress(src)})` : '<br>'
    }
    case 'table':
      return tableMd(node)
    default: {
      // Something this converter doesn't know: its words. (Kept as it is if the AI leaves it alone.)
      const text = escapeText(plainText(node).replace(/\s+/g, ' ').trim(), true)
      return text || '<br>'
    }
  }
}

/** A list item: the marker, its first line (with its task mark), then its other parts indented. */
function itemMd(item: NoteNode, marker: string, pad: number): string {
  const parts = item.content ?? []
  const first = parts[0]?.type === 'paragraph' ? parts[0] : null
  const rest = first ? parts.slice(1) : parts
  const line = first ? inlineMd(first.content) : ''
  let out = (line.trim() ? line : '') + taskMark(item)
  for (const part of rest) {
    // A list right under the line needs no empty line before it. (An ordered list that doesn't
    // start at 1 does: else it would be read as more words of the line.)
    const tight = isList(part) && !(part.type === 'orderedList' && listStart(part) !== 1)
    out += (tight ? '\n' : '\n\n') + blockMd(part)
  }
  const text = out ? marker + out : marker.trimEnd()
  const indent = ' '.repeat(pad)
  return text.split('\n').map((l, i) => (i === 0 || l === '' ? l : indent + l)).join('\n')
}

function imageMd(node: NoteNode): string {
  const src = typeof node.attrs?.src === 'string' ? node.attrs.src.trim() : ''
  const altValue = node.attrs?.alt
  const alt = typeof altValue === 'string' ? escapeText(altValue.replace(/\s+/g, ' ').trim(), false) : ''
  if (/^https?:\/\//i.test(src)) return `![${alt}](${mdAddress(src)})`
  if (src) return `![${alt}](picture:${pictureKey(src)})`
  return '<br>'
}

/** A table: the first row is the header row. Every cell is on one line. */
function tableMd(table: NoteNode): string {
  const rows = (table.content ?? []).map((row) => (row.content ?? []).map(cellMd))
  if (rows.length === 0) return '<br>'
  const width = Math.max(1, ...rows.map((r) => r.length))
  const line = (r: string[]) => `| ${[...r, ...Array<string>(width - r.length).fill('')].join(' | ')} |`
  const [head, ...rest] = rows
  return [line(head!), `|${' --- |'.repeat(width)}`, ...rest.map(line)].join('\n')
}

/** A table cell: <br> for a line break, <br><br> between paragraphs, and \| for a | in it. */
function cellMd(cell: NoteNode): string {
  const parts = (cell.content ?? []).map((part) => {
    if (part.type === 'paragraph') return inlineMd(part.content, { table: true }) + taskMark(part)
    if (part.type === 'heading') return inlineMd(part.content, { table: true })
    if (part.type === 'image') return imageMd(part)
    return escapeText(plainText(part).replace(/\s+/g, ' ').trim(), false)
  })
  const text = parts.length === 1 && !parts[0]!.trim() ? '' : parts.join('<br><br>')
  return text.replace(/\|/g, '\\|')
}

/** An address for (…): as it is when it can be, else in <…>. */
function mdAddress(address: string): string {
  let depth = 0
  let balanced = true
  for (const c of address) {
    if (c === '(') depth++
    else if (c === ')' && --depth < 0) balanced = false
  }
  if (balanced && depth === 0 && !/[\s<>]/.test(address)) return address
  return `<${address.replace(/[\n\r<>]/g, (c) => encodeURIComponent(c))}>`
}

// ---- Words and their marks (bold, italic, strike, code, links) ----

const MARK_ORDER = ['link', 'bold', 'italic', 'strike'] as const
type Open = { type: (typeof MARK_ORDER)[number]; href?: string }

const opener = (m: Open) => (m.type === 'link' ? '[' : m.type === 'bold' ? '**' : m.type === 'italic' ? '*' : '~~')
const closer = (m: Open) => (m.type === 'link' ? `](${mdAddress(m.href ?? '')})` : opener(m))
const sameMark = (a: Open, b: Open) => a.type === b.type && a.href === b.href

function marksOf(node: NoteNode): Open[] {
  const marks = node.marks ?? []
  const out: Open[] = []
  for (const type of MARK_ORDER) {
    const m = marks.find((x: NoteMark) => x.type === type)
    if (!m) continue
    if (type === 'link') {
      const href = m.attrs?.href
      if (isSafeLinkHref(href)) out.push({ type, href: href.trim() })
    } else out.push({ type })
  }
  return out
}

interface InlineOptions {
  /** A heading: all on one line (a line break becomes a space). */
  oneLine?: boolean
  /** A table cell: all on one line (a line break becomes <br>). */
  table?: boolean
}

function inlineMd(nodes: NoteNode[] | undefined, opts: InlineOptions = {}): string {
  // Words with new lines in them (the editor doesn't make these, but they can be in a note): line breaks.
  const list: NoteNode[] = []
  for (const node of nodes ?? []) {
    const code = (node.marks ?? []).some((m) => m.type === 'code')
    if (node.type === 'text' && !code && node.text?.includes('\n')) {
      node.text.split('\n').forEach((part, i) => {
        if (i > 0) list.push({ type: 'hardBreak' })
        if (part) list.push({ ...node, text: part })
      })
    } else list.push(node)
  }
  // Line breaks at the very end can't be new lines (an empty line ends the paragraph): <br>.
  let end = list.length
  while (end > 0 && list[end - 1]!.type === 'hardBreak') end--

  let out = ''
  let open: Open[] = []
  const closeTo = (keep: number) => {
    if (open.length <= keep) return
    // A closing ** can't come after a space: put the spaces after it.
    const spaces = /[ \t]+$/.exec(out)?.[0] ?? ''
    if (spaces) out = out.slice(0, -spaces.length)
    while (open.length > keep) out += closer(open.pop()!)
    out += spaces
  }
  const atLineStart = () => !opts.oneLine && !opts.table && (out === '' || out.endsWith('\n'))

  for (const node of list.slice(0, end)) {
    if (node.type === 'hardBreak') {
      closeTo(0)
      if (opts.table) out += '<br>'
      else if (opts.oneLine) out += ' '
      else {
        // An empty line would end the paragraph: a \ at its end keeps it in.
        const line = out.slice(out.lastIndexOf('\n') + 1)
        out += line.trim() === '' ? '\\\n' : '\n'
      }
      continue
    }
    const isText = node.type === 'text'
    const text = isText ? (node.text ?? '') : plainText(node).replace(/\n/g, ' ')
    if (!text) continue
    const code = isText && (node.marks ?? []).some((m) => m.type === 'code')
    let want = isText && !code ? marksOf(node) : []
    let keep = 0
    while (keep < open.length && keep < want.length && sameMark(open[keep]!, want[keep]!)) keep++
    // Only spaces: don't start marks for them.
    if (!code && text.trim() === '') want = want.slice(0, keep)
    closeTo(keep)

    if (code) {
      const flat = text.replace(/\n/g, ' ')
      const ticks = '`'.repeat(Math.max(0, ...(flat.match(/`+/g) ?? []).map((s) => s.length)) + 1)
      const pad = flat.startsWith('`') || flat.endsWith('`') || (/^ .* $/.test(flat) && flat.trim() !== '') ? ' ' : ''
      out += `${ticks}${pad}${flat}${pad}${ticks}`
      continue
    }
    // Spaces go before a new mark (**word**, not ** word**).
    const lead = want.length > keep ? (/^[ \t]+/.exec(text)?.[0] ?? '') : ''
    out += lead
    for (const m of want.slice(keep)) out += opener(m)
    open = want
    out += escapeText(text.slice(lead.length), atLineStart())
  }
  closeTo(0)
  const trailing = list.length - end
  if (trailing) out += (opts.oneLine ? ' ' : '<br>').repeat(trailing)
  return out
}

/** Words with the Markdown signs in them escaped, so they read back the same. */
function escapeText(text: string, lineStart: boolean): string {
  let s = text
    .replace(/[\\`*[\]]/g, '\\$&')
    .replace(/~~/g, '\\~\\~')
    .replace(/<(?=[A-Za-z!/?])/g, '\\<')
    // _ only where it could start or end italics (not inside words like snake_case)
    .replace(/_/g, (m, i: number, all: string) => (/\w/.test(all[i - 1] ?? '') && /\w/.test(all[i + 1] ?? '') ? m : '\\_'))
  if (lineStart) {
    if (/^[ \t]*([-+*])([ \t]|$)/.test(s) || /^[ \t]*#{1,6}([ \t]|$)/.test(s) || /^[ \t]*>/.test(s)) {
      s = s.replace(/^([ \t]*)(.)/, '$1\\$2')
    } else if (/^[ \t]*\d{1,9}[.)]([ \t]|$)/.test(s)) {
      s = s.replace(/^([ \t]*\d{1,9})([.)])/, '$1\\$2')
    } else if (/^[ \t]*([-=])(?:[ \t]*\1){2,}[ \t]*$/.test(s) || (s.includes('|') && TABLE_DELIM.test(s))) {
      // a line (---), or the second line of a table (--- | ---)
      s = s.replace(/^([ \t]*)(.)/, '$1\\$2')
    }
  }
  return s
}

// =========================================================================================
// Markdown → note

export interface MarkdownResult {
  doc: NoteNode
  /** Things the AI should know, like a picture placeholder that is not in the note. */
  warnings: string[]
}

/**
 * A note made from Markdown. With `before` (the note as it was), the pieces that did not change
 * keep their exact parts, pictures keep their placeholders, and task lines keep their tasks.
 * `noteTasks`: the ids of the tasks that belong to this note, also the ones whose line was taken
 * out before (so a line that is put back gets its task back). Other task marks are dropped.
 */
export function markdownAsNote(markdown: string, before?: unknown, noteTasks: Iterable<string> = []): MarkdownResult {
  lookWork = 0
  const old = before === undefined ? null : oldNote(before)
  const taskIds = new Set(old?.taskIds ?? [])
  for (const id of noteTasks) if (TASK_ID.test(id)) taskIds.add(id.toLowerCase())
  const ctx: Ctx = {
    pictures: old?.pictures ?? new Map(),
    media: old?.media ?? new Map(),
    taskIds,
    warnings: [],
  }
  const content: NoteNode[] = []
  for (const block of parseBlocks(prepareLines(markdown), 0, ctx, true)) {
    const reused = old?.pieces.get(pieceKey(block.src))?.shift()
    if (reused) content.push(reused)
    else content.push(...block.nodes)
  }
  const doc = cleanNoteContent({ type: 'doc', content: dedupeTasks(content) }) ?? { type: 'doc', content: [] }
  if (!doc.content?.length) doc.content = [{ type: 'paragraph' }]
  return { doc, warnings: [...new Set(ctx.warnings)] }
}

/** A piece of Markdown, for finding the same piece again (spaces at line ends don't count). */
function pieceKey(md: string): string {
  return md.split('\n').map((l) => leadingSpaces(l).trimEnd()).join('\n').trim()
}

function oldNote(content: unknown): OldNote {
  const { blocks } = noteAsMarkdown(content)
  const pieces = new Map<string, NoteNode[]>()
  for (const b of blocks) {
    const key = pieceKey(b.md)
    const list = pieces.get(key)
    if (list) list.push(b.node)
    else pieces.set(key, [b.node])
  }
  const pictures = new Map<string, NoteNode>()
  const media = new Map<string, NoteNode>()
  const taskIds = new Set<string>()
  const walk = (node: NoteNode) => {
    const src = typeof node.attrs?.src === 'string' ? node.attrs.src.trim() : ''
    if (node.type === 'image' && src) {
      if (/^https?:\/\//i.test(src)) media.set(src, node)
      else pictures.set(pictureKey(src), node)
    }
    if (node.type === 'youtube' && src) media.set(youtubeSrc(src) ?? src, node)
    const id = node.attrs?.taskId
    if (typeof id === 'string' && TASK_ID.test(id)) taskIds.add(id.toLowerCase())
    for (const child of node.content ?? []) walk(child)
  }
  for (const b of blocks) walk(b.node)
  return { pieces, pictures, media, taskIds }
}

/** A task id used twice (a copied line) stays on the first line only. */
function dedupeTasks(nodes: NoteNode[]): NoteNode[] {
  const seen = new Set<string>()
  const walk = (n: NoteNode): NoteNode => {
    let out = n
    const id = n.attrs?.taskId
    if (typeof id === 'string' && id) {
      const key = id.toLowerCase()
      if (seen.has(key)) out = { ...n, attrs: { ...n.attrs, taskId: null } }
      else seen.add(key)
    }
    return out.content ? { ...out, content: out.content.map(walk) } : out
  }
  return nodes.map(walk)
}

interface Ctx {
  pictures: Map<string, NoteNode>
  media: Map<string, NoteNode>
  taskIds: Set<string>
  warnings: string[]
}

interface Block {
  nodes: NoteNode[]
  /** The Markdown it came from (top level only). */
  src: string
}

// ---- Lines ----

/** Tabs at the start of a line count as spaces (up to the next multiple of 4). */
function leadingSpaces(line: string): string {
  const m = /^[ \t]+/.exec(line)
  if (!m || !m[0].includes('\t')) return line
  let col = 0
  for (const c of m[0]) col = c === '\t' ? col + 4 - (col % 4) : col + 1
  return ' '.repeat(col) + line.slice(m[0].length)
}

/** The lines, with tabs at their start as spaces. Lines inside a code block are kept as they are. */
function prepareLines(markdown: string): string[] {
  const out: string[] = []
  let fence: string | null = null
  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      const close = CLOSE_FENCE.exec(raw)
      if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) fence = null
      out.push(raw)
      continue
    }
    const line = leadingSpaces(raw)
    const open = FENCE.exec(line)
    if (open && !(open[2]![0] === '`' && open[3]!.includes('`'))) fence = open[2]!
    out.push(line)
  }
  return out
}

const isBlank = (l: string | undefined) => l === undefined || l.trim() === ''
const indentOf = (l: string) => l.length - l.trimStart().length

const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/
const CLOSE_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/
const HR = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const QUOTE = /^ {0,3}>( ?)(.*)$/
const EMPTY_LINE = /^ {0,3}<br\s*\/?>[ \t]*(?:<!--\s*task:([\w-]+)\s*-->)?[ \t]*$/i
const YOUTUBE = /^ {0,3}@\[youtube\]\(\s*<?([^\s<>]+?)>?\s*\)[ \t]*$/i
const BULLET = /^( *)([-+*])(?:( +)(.*))?$/
const ORDERED = /^( *)(\d{1,9})([.)])(?:( +)(.*))?$/
const TASK_BOX = /^\[([ xX])\](?: +(.*)|$)/
const TASK_MARK = /[ \t]*<!--\s*task:([\w-]+)\s*-->[ \t]*$/i
const TABLE_DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/

interface Marker {
  indent: number
  /** Where the item's words start. */
  content: number
  bullet: string | null
  delim: string | null
  start: number
  rest: string
}

function listMarker(line: string): Marker | null {
  let m = BULLET.exec(line)
  if (m) {
    const spaces = m[3] ?? ''
    const width = spaces.length > 4 ? 1 : spaces.length
    return {
      indent: m[1]!.length,
      content: m[1]!.length + 1 + (m[4] === undefined ? 1 : width),
      bullet: m[2]!,
      delim: null,
      start: 1,
      rest: m[4] === undefined ? '' : (spaces.length > 4 ? spaces.slice(1) : '') + m[4],
    }
  }
  m = ORDERED.exec(line)
  if (m) {
    const spaces = m[4] ?? ''
    const width = spaces.length > 4 ? 1 : spaces.length
    return {
      indent: m[1]!.length,
      content: m[1]!.length + m[2]!.length + 1 + (m[5] === undefined ? 1 : width),
      bullet: null,
      delim: m[3]!,
      start: Number(m[2]),
      rest: m[5] === undefined ? '' : (spaces.length > 4 ? spaces.slice(1) : '') + m[5],
    }
  }
  return null
}

function isTableStart(head: string | undefined, delim: string | undefined): boolean {
  if (!head || !delim || !head.includes('|') || !delim.includes('-') || !TABLE_DELIM.test(delim)) return false
  const columns = splitRow(head).length
  if (!delim.includes('|') && columns !== 1) return false
  return columns === splitRow(delim).length
}

/** Does this line start a new part (so it ends a paragraph)? */
function startsBlock(line: string, next: string | undefined): boolean {
  if (FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || EMPTY_LINE.test(line) || YOUTUBE.test(line)) return true
  const m = listMarker(line)
  if (m && m.indent < 4 && m.rest.trim() !== '' && (m.bullet || m.start === 1)) return true
  return isTableStart(line, next)
}

// ---- Parts ----

function parseBlocks(lines: string[], depth: number, ctx: Ctx, top = false): Block[] {
  const out: Block[] = []
  let i = 0
  const push = (nodes: NoteNode[], from: number, to: number) => {
    out.push({ nodes, src: top ? lines.slice(from, to).join('\n') : '' })
  }
  while (i < lines.length) {
    const line = lines[i]!
    if (isBlank(line)) {
      i++
      continue
    }
    const start = i
    let m: RegExpExecArray | null

    // Too deep (a quote in a list in a quote…): the rest is plain words.
    if (depth > MAX_DEPTH) {
      push(paragraphNodes(lines.slice(i).map((l) => l.trim()).join(' '), ctx), i, lines.length)
      break
    }

    if ((m = FENCE.exec(line)) && !(m[2]![0] === '`' && m[3]!.includes('`'))) {
      const fence = m[2]!
      const indent = m[1]!.length
      const code: string[] = []
      i++
      while (i < lines.length) {
        const l = lines[i]!
        const close = CLOSE_FENCE.exec(l)
        if (close && close[1]![0] === fence[0] && close[1]!.length >= fence.length) {
          i++
          break
        }
        code.push(l.slice(Math.min(indent, indentOf(l))))
        i++
      }
      const language = m[3]!.trim().split(/\s+/)[0] ?? ''
      const text = code.join('\n')
      const node: NoteNode = { type: 'codeBlock', attrs: { language: language || null } }
      if (text) node.content = [{ type: 'text', text }]
      push([node], start, i)
      continue
    }

    if ((m = HEADING.exec(line))) {
      i++
      const content = inlineNodes(m[2] ?? '', ctx).filter((n) => n.type !== 'image')
      push([{ type: 'heading', attrs: { level: m[1]!.length }, ...(content.length ? { content } : {}) }], start, i)
      continue
    }

    if (HR.test(line)) {
      i++
      push([{ type: 'horizontalRule' }], start, i)
      continue
    }

    if ((m = EMPTY_LINE.exec(line))) {
      i++
      push([withTask({ type: 'paragraph' }, m[1], ctx)], start, i)
      continue
    }

    if ((m = YOUTUBE.exec(line))) {
      i++
      push(youtubeNodes(m[1]!, ctx), start, i)
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && (m = QUOTE.exec(lines[i]!))) {
        inner.push(m[2]!)
        i++
      }
      const content = parseBlocks(inner, depth + 1, ctx).flatMap((b) => b.nodes)
      push([{ type: 'blockquote', content: content.length ? content : [{ type: 'paragraph' }] }], start, i)
      continue
    }

    const marker = listMarker(line)
    if (marker && marker.indent < 4) {
      const { nodes, end } = parseList(lines, i, marker, depth, ctx)
      i = end
      push(nodes, start, i)
      continue
    }

    if (isTableStart(line, lines[i + 1])) {
      const { node, end } = parseTable(lines, i, ctx)
      i = end
      push([node], start, i)
      continue
    }

    // A paragraph: lines up to an empty line or a new part.
    const text: string[] = [line.trim()]
    i++
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines[i]!, lines[i + 1])) {
      text.push(lines[i]!.trim())
      i++
    }
    push(paragraphNodes(text.join('\n'), ctx), start, i)
  }
  return out
}

function parseList(lines: string[], from: number, first: Marker, depth: number, ctx: Ctx): { nodes: NoteNode[]; end: number } {
  const items: { task: boolean; node: NoteNode }[] = []
  let i = from
  let marker: Marker | null = first
  while (marker) {
    let head = marker.rest
    let task = false
    let checked = false
    const box = marker.bullet ? TASK_BOX.exec(head) : null
    if (box) {
      task = true
      checked = box[1] !== ' '
      head = box[2] ?? ''
    }
    const itemLines: string[] = [head]
    // Lines indented this much belong to the item (a bit less than CommonMark asks is fine).
    const inside = Math.min(marker.content, marker.indent + 2)
    i++
    while (i < lines.length) {
      const l = lines[i]!
      if (isBlank(l)) {
        // An empty line: the item goes on if the next words are indented under it.
        let j = i + 1
        while (j < lines.length && isBlank(lines[j])) j++
        if (j < lines.length && indentOf(lines[j]!) >= inside) {
          for (; i < j; i++) itemLines.push('')
          continue
        }
        break
      }
      const ind = indentOf(l)
      if (ind >= inside) {
        itemLines.push(l.slice(Math.min(ind, marker.content)))
        i++
        continue
      }
      // Not indented: a new item, a new part, or more words of the item's last line.
      if (listMarker(l) || startsBlock(l, lines[i + 1])) break
      const last = itemLines[itemLines.length - 1]
      if (last === undefined || isBlank(last) || startsBlock(last, undefined) || listMarker(last)) break
      itemLines.push(l.trim())
      i++
    }

    let content = parseBlocks(itemLines, depth + 1, ctx).flatMap((b) => b.nodes)
    if (!content.length || content[0]!.type !== 'paragraph') content = [{ type: 'paragraph' }, ...content]
    // The task mark of the item's first line belongs to the item.
    const firstPara = content[0]!
    const taskId = firstPara.attrs?.taskId
    const attrs: Record<string, unknown> = {}
    if (typeof taskId === 'string') {
      content[0] = { ...firstPara, attrs: { ...firstPara.attrs, taskId: null } }
      attrs.taskId = taskId
    }
    if (task) attrs.checked = checked
    const node: NoteNode = { type: task ? 'taskItem' : 'listItem', content }
    if (Object.keys(attrs).length) node.attrs = attrs
    items.push({ task, node })

    // The next item of the same list (empty lines between items are fine).
    let j = i
    while (j < lines.length && isBlank(lines[j])) j++
    const next = j < lines.length ? listMarker(lines[j]!) : null
    if (next && next.indent < first.content && next.indent < 4 && sameKind(next, first)) {
      i = j
      marker = next
    } else marker = null
  }

  // A list with and without check boxes becomes one list for each kind (the editor needs that).
  const nodes: NoteNode[] = []
  let k = 0
  while (k < items.length) {
    const task = items[k]!.task
    const group: NoteNode[] = []
    while (k < items.length && items[k]!.task === task) group.push(items[k++]!.node)
    if (task) nodes.push({ type: 'taskList', content: group })
    else if (first.bullet) nodes.push({ type: 'bulletList', content: group })
    else nodes.push({ type: 'orderedList', attrs: { start: first.start }, content: group })
  }
  return { nodes, end: i }
}

function sameKind(a: Marker, b: Marker): boolean {
  return a.bullet !== null ? a.bullet === b.bullet : a.delim === b.delim
}

/** The cells of a table row. \| stays in the cell (it is a | in the cell's words). */
function splitRow(line: string): string[] {
  let s = line.trim()
  if (s.startsWith('|')) s = s.slice(1)
  const cells: string[] = []
  let cur = ''
  for (let k = 0; k < s.length; k++) {
    const c = s[k]!
    if (c === '\\' && k + 1 < s.length) {
      cur += c + s[k + 1]
      k++
    } else if (c === '|') {
      cells.push(cur.trim())
      cur = ''
    } else cur += c
  }
  // A | at the end closes the row; it doesn't start another cell.
  if (cur.trim() !== '' || cells.length === 0) cells.push(cur.trim())
  return cells
}

function parseTable(lines: string[], from: number, ctx: Ctx): { node: NoteNode; end: number } {
  const head = splitRow(lines[from]!)
  const width = head.length
  const rows: string[][] = [head]
  let i = from + 2
  while (i < lines.length && !isBlank(lines[i]) && lines[i]!.includes('|') && !startsBlock(lines[i]!, undefined)) {
    rows.push(splitRow(lines[i]!))
    i++
  }
  const cell = (raw: string, header: boolean): NoteNode => {
    const content = raw
      .replace(/\\\|/g, '|')
      .split(/(?<!\\)<br\s*\/?>[ \t]*<br\s*\/?>/i)
      .flatMap((piece) => (piece.trim() ? paragraphNodes(piece.trim(), ctx) : [{ type: 'paragraph' }]))
    return {
      type: header ? 'tableHeader' : 'tableCell',
      attrs: { colspan: 1, rowspan: 1, colwidth: null },
      content: content.length ? content : [{ type: 'paragraph' }],
    }
  }
  const node: NoteNode = {
    type: 'table',
    content: rows.map((r, n) => ({
      type: 'tableRow',
      content: Array.from({ length: width }, (_, c) => cell(r[c] ?? '', n === 0)),
    })),
  }
  return { node, end: i }
}

/** The line keeps its task only if the task is one of this note's (an AI can't make up tasks). */
function withTask(node: NoteNode, id: string | undefined, ctx: Ctx): NoteNode {
  if (!id) return node
  const lower = id.toLowerCase()
  if (!TASK_ID.test(lower) || !ctx.taskIds.has(lower)) return node
  return { ...node, attrs: { ...node.attrs, taskId: lower } }
}

function youtubeNodes(address: string, ctx: Ctx): NoteNode[] {
  const src = youtubeSrc(address)
  if (!src) {
    ctx.warnings.push(`"${address.slice(0, 100)}" is not a YouTube address, so it was added as a link.`)
    return paragraphNodes(address, ctx)
  }
  const old = ctx.media.get(src)
  return [{ type: 'youtube', attrs: { ...(old?.type === 'youtube' ? old.attrs : {}), src } }]
}

// ---- Paragraphs ----

/** A paragraph from its Markdown. Pictures in it become parts of their own (as in the editor). */
function paragraphNodes(text: string, ctx: Ctx): NoteNode[] {
  let taskId: string | undefined
  const mark = TASK_MARK.exec(text)
  if (mark) {
    taskId = mark[1]
    text = text.slice(0, mark.index)
  }
  const out: NoteNode[] = []
  let cur: NoteNode[] = []
  let afterPicture = false
  const flush = (beforePicture: boolean) => {
    // Next to a picture: no line breaks or spaces on that side.
    if (afterPicture) {
      while (cur[0]?.type === 'hardBreak') cur.shift()
      if (cur[0]?.type === 'text') cur[0] = { ...cur[0], text: cur[0].text?.trimStart() }
    }
    if (beforePicture) {
      while (cur[cur.length - 1]?.type === 'hardBreak') cur.pop()
      const last = cur[cur.length - 1]
      if (last?.type === 'text') cur[cur.length - 1] = { ...last, text: last.text?.trimEnd() }
    }
    cur = cur.filter((n) => n.type !== 'text' || n.text)
    const onlySpace = cur.every((n) => n.type === 'hardBreak' || !n.text?.trim())
    if (cur.length && !((beforePicture || afterPicture) && onlySpace)) out.push({ type: 'paragraph', content: cur })
    cur = []
    afterPicture = false
  }
  const nodes = inlineNodes(text, ctx)
  // Everything in it was left out (a picture that can't be used, a comment): no paragraph.
  if (!nodes.length && text.trim() && !taskId) return []
  for (const n of nodes) {
    if (n.type === 'image') {
      flush(true)
      out.push(n)
      afterPicture = true
    } else cur.push(n)
  }
  flush(false)
  if (!out.length) out.push({ type: 'paragraph' })
  if (taskId) {
    const k = out.findIndex((n) => n.type === 'paragraph')
    if (k >= 0) out[k] = withTask(out[k]!, taskId, ctx)
  }
  return out
}

// ---- Words: **bold**, *italic*, ~~strike~~, `code`, [links](…), ![pictures](…) ----

type Inl =
  | { t: 'text'; s: string }
  | { t: 'code'; s: string }
  | { t: 'br' }
  | { t: 'link'; href: string; kids: Inl[] }
  | { t: 'image'; src: string; alt: string }
  | { t: 'bold' | 'italic' | 'strike'; kids: Inl[] }
  | { t: 'delim'; ch: string; n: number; orig: number; canOpen: boolean; canClose: boolean }

/** Longer words are not read for marks (it would take too long). */
const MAX_INLINE = 200_000
/** How far to look for the end of a link or a `code` part. */
const LOOK_AHEAD = 10_000
const MAX_DELIMS = 2000
/**
 * How many characters one note may look through in all, to find the ends of links and `code`
 * parts. A normal note needs a small part of this. Strange ones (like 50 000 "[" in a row)
 * would take seconds, and the server can't do anything else meanwhile: when this runs out,
 * the rest of the note is read without new links and `code` parts.
 */
const MAX_LOOK_WORK = 5_000_000
let lookWork = 0

/** Where `find` is in s, starting at `from` and before `end`, or -1. Counts the looking. */
function findBefore(s: string, find: string, from: number, end: number): number {
  const stop = Math.min(end, s.length)
  if (from >= stop) return -1
  const at = s.slice(from, Math.min(s.length, stop + find.length - 1)).indexOf(find)
  lookWork += (at === -1 ? stop - from : at) + 1
  return at === -1 ? -1 : from + at
}

const PUNCT = /[!-/:-@[-`{-~\p{P}\p{S}]/u
const ASCII_PUNCT = /[!-/:-@[-`{-~]/
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c)
const isPunct = (c: string | undefined) => c !== undefined && PUNCT.test(c)

const AUTOLINK = /<((?:https?|ftp|mailto|tel):[^\s<>]+)>/iy
const BR_TAG = /<br\s*\/?>/iy
const COMMENT = /<!--[\s\S]*?-->/y
const WEB_ADDRESS = /https?:\/\/[^\s<>]+/iy

function inlineNodes(text: string, ctx: Ctx): NoteNode[] {
  const out: NoteNode[] = []
  flatten(parseInline(text, 0), [], out, ctx)
  // Join words next to each other that have the same marks.
  const merged: NoteNode[] = []
  for (const n of out) {
    const last = merged[merged.length - 1]
    if (n.type === 'text' && last?.type === 'text' && sameMarks(last.marks, n.marks)) last.text = (last.text ?? '') + (n.text ?? '')
    else merged.push(n)
  }
  return merged.filter((n) => n.type !== 'text' || n.text)
}

function sameMarks(a: NoteMark[] | undefined, b: NoteMark[] | undefined): boolean {
  const key = (m: NoteMark[] | undefined) => JSON.stringify((m ?? []).map((x) => [x.type, x.attrs?.href ?? null]).sort())
  return key(a) === key(b)
}

function sticky(re: RegExp, s: string, at: number): RegExpExecArray | null {
  re.lastIndex = at
  return re.exec(s)
}

function parseInline(s: string, depth: number): Inl[] {
  if (s.length > MAX_INLINE) return [{ t: 'text', s }]
  const toks: Inl[] = []
  let buf = ''
  const flush = () => {
    if (buf) toks.push({ t: 'text', s: buf })
    buf = ''
  }
  const lineBreak = (next: number) => {
    buf = buf.replace(/[ \t]+$/, '')
    flush()
    toks.push({ t: 'br' })
    // Spaces at the start of the next line don't count.
    while (s[next] === ' ' || s[next] === '\t') next++
    return next
  }
  let pos = 0
  while (pos < s.length) {
    const c = s[pos]!
    if (c === '\\') {
      const next = s[pos + 1]
      if (next === '\n') {
        pos = lineBreak(pos + 2)
        continue
      }
      if (next !== undefined && ASCII_PUNCT.test(next)) {
        buf += next
        pos += 2
        continue
      }
    }
    if (c === '\n') {
      pos = lineBreak(pos + 1)
      continue
    }
    if (c === '`') {
      let n = 1
      while (s[pos + n] === '`') n++
      const run = '`'.repeat(n)
      const limit = Math.min(s.length, pos + LOOK_AHEAD)
      let k = pos + n
      let close = -1
      while (lookWork < MAX_LOOK_WORK && (k = findBefore(s, run, k, limit)) !== -1) {
        if (s[k + n] !== '`') {
          close = k
          break
        }
        while (s[k] === '`') k++
      }
      if (close !== -1) {
        let code = s.slice(pos + n, close).replace(/\n/g, ' ')
        if (code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') code = code.slice(1, -1)
        flush()
        toks.push({ t: 'code', s: code })
        pos = close + n
      } else {
        buf += run
        pos += n
      }
      continue
    }
    if (c === '!' && s[pos + 1] === '[' && depth < 10) {
      const link = parseLinkAt(s, pos + 1)
      if (link) {
        flush()
        toks.push({ t: 'image', src: link.dest, alt: plainOf(parseInline(link.label, depth + 1)) })
        pos = link.end
        continue
      }
    }
    if (c === '[' && depth < 10) {
      const link = parseLinkAt(s, pos)
      if (link) {
        flush()
        toks.push({ t: 'link', href: link.dest, kids: parseInline(link.label, depth + 1) })
        pos = link.end
        continue
      }
    }
    if (c === '<') {
      let m: RegExpExecArray | null
      if ((m = sticky(AUTOLINK, s, pos))) {
        flush()
        toks.push({ t: 'link', href: m[1]!, kids: [{ t: 'text', s: m[1]!.replace(/^mailto:/i, '') }] })
        pos += m[0].length
        continue
      }
      if ((m = sticky(BR_TAG, s, pos))) {
        flush()
        toks.push({ t: 'br' })
        pos += m[0].length
        continue
      }
      // An HTML comment (like a task mark in the wrong place): left out.
      if ((m = sticky(COMMENT, s, pos))) {
        pos += m[0].length
        continue
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      let n = 1
      while (s[pos + n] === c) n++
      if (c === '~' && n !== 2) {
        buf += c.repeat(n)
        pos += n
        continue
      }
      const before = s[pos - 1]
      const after = s[pos + n]
      const left = !isSpace(after) && (!isPunct(after) || isSpace(before) || isPunct(before))
      const right = !isSpace(before) && (!isPunct(before) || isSpace(after) || isPunct(after))
      let canOpen = left
      let canClose = right
      if (c === '_') {
        canOpen = left && (!right || isPunct(before))
        canClose = right && (!left || isPunct(after))
      }
      flush()
      toks.push({ t: 'delim', ch: c, n, orig: n, canOpen, canClose })
      pos += n
      continue
    }
    if ((c === 'h' || c === 'H') && !/\w/.test(s[pos - 1] ?? '')) {
      const m = sticky(WEB_ADDRESS, s, pos)
      const url = m ? trimAddress(m[0]) : null
      if (url) {
        flush()
        toks.push({ t: 'link', href: url, kids: [{ t: 'text', s: url }] })
        pos += url.length
        continue
      }
    }
    buf += c
    pos++
  }
  flush()
  return emphasis(toks)
}

/** A web address written as it is, without the punctuation after it. */
function trimAddress(found: string): string | null {
  let url = found
  for (;;) {
    const last = url[url.length - 1]
    if (last && '.,;:!?\'"*_~'.includes(last)) url = url.slice(0, -1)
    else if (last === ')' && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1)
    else break
  }
  return /^https?:\/\/./i.test(url) ? url : null
}

/** [label](destination "title") starting at s[at] === '['. */
function parseLinkAt(s: string, at: number): { label: string; dest: string; end: number } | null {
  if (lookWork >= MAX_LOOK_WORK) return null
  const limit = Math.min(s.length, at + LOOK_AHEAD)
  let depth = 0
  let k = at
  let close = -1
  while (k < limit) {
    const c = s[k]!
    if (c === '\\') {
      k += 2
      continue
    }
    if (c === '`') {
      let n = 1
      while (s[k + n] === '`') n++
      const end = findBefore(s, '`'.repeat(n), k + n, limit + 1)
      k = end === -1 ? k + n : end + n
      continue
    }
    if (c === '[') depth++
    else if (c === ']' && --depth === 0) {
      close = k
      break
    }
    k++
  }
  lookWork += k - at + 1
  if (close === -1 || s[close + 1] !== '(') return null
  let p = close + 2
  while (s[p] === ' ') p++
  let dest = ''
  if (s[p] === '<') {
    const end = findBefore(s, '>', p, limit + 1)
    if (end === -1 || s.slice(p, end).includes('\n')) return null
    dest = s.slice(p + 1, end)
    p = end + 1
  } else {
    let parens = 0
    const begin = p
    while (p < limit) {
      const code = s.charCodeAt(p)
      if (code === 92 && p + 1 < s.length) { // \
        p += 2
        continue
      }
      // A space ends the address (checked by number: this runs for every character).
      if (code <= 32 || (code > 127 && /\s/.test(s[p]!))) break
      if (code === 40) parens++ // (
      else if (code === 41) { // )
        if (parens === 0) break
        parens--
      }
      p++
    }
    lookWork += p - begin
    dest = s.slice(begin, p).replace(/\\([!-/:-@[-`{-~])/g, '$1')
  }
  while (s[p] === ' ') p++
  const quote = s[p]
  if (quote === '"' || quote === '\'' || quote === '(') {
    const end = findBefore(s, quote === '(' ? ')' : quote, p + 1, limit + 1)
    if (end === -1) return null
    p = end + 1
    while (s[p] === ' ') p++
  }
  if (s[p] !== ')') return null
  return { label: s.slice(at + 1, close), dest: dest.trim(), end: p + 1 }
}

/** Pair the * _ ~~ signs into bold, italic and strike (CommonMark's rules). */
function emphasis(toks: Inl[]): Inl[] {
  if (toks.filter((t) => t.t === 'delim').length > MAX_DELIMS) return toks.map(literal)
  let c = 0
  while (c < toks.length) {
    const closer = toks[c]!
    if (closer.t !== 'delim' || !closer.canClose || closer.n === 0) {
      c++
      continue
    }
    let found = -1
    for (let o = c - 1; o >= 0; o--) {
      const op = toks[o]!
      if (op.t !== 'delim' || op.ch !== closer.ch || !op.canOpen || op.n === 0) continue
      // CommonMark's "rule of 3", for runs that can both open and close.
      if (closer.ch !== '~' && (op.canClose || closer.canOpen)
        && (op.orig + closer.orig) % 3 === 0 && !(op.orig % 3 === 0 && closer.orig % 3 === 0)) continue
      found = o
      break
    }
    if (found === -1) {
      c++
      continue
    }
    const op = toks[found] as Extract<Inl, { t: 'delim' }>
    const use = closer.ch === '~' ? 2 : op.n >= 2 && closer.n >= 2 ? 2 : 1
    const type = closer.ch === '~' ? 'strike' : use === 2 ? 'bold' : 'italic'
    const inner = toks.slice(found + 1, c).map(literal)
    op.n -= use
    closer.n -= use
    toks.splice(found + 1, c - found - 1, { t: type, kids: inner })
    // Now: the opener at found, the new part at found + 1, the closer at found + 2.
    c = found + 2
    if (op.n === 0) {
      toks.splice(found, 1)
      c--
    }
    if (closer.n === 0) toks.splice(c, 1)
  }
  return toks.map(literal)
}

function literal(t: Inl): Inl {
  return t.t === 'delim' ? { t: 'text', s: t.ch.repeat(t.n) } : t
}

function plainOf(toks: Inl[]): string {
  return toks.map((t) => {
    if (t.t === 'text' || t.t === 'code') return t.s
    if (t.t === 'br') return ' '
    if (t.t === 'image') return t.alt
    if (t.t === 'delim') return t.ch.repeat(t.n)
    return plainOf(t.kids)
  }).join('')
}

/** The parts as note JSON: words with their marks, line breaks, and pictures. */
function flatten(toks: Inl[], marks: NoteMark[], out: NoteNode[], ctx: Ctx) {
  const text = (s: string, m: NoteMark[]) => {
    if (s) out.push(m.length ? { type: 'text', text: s, marks: m } : { type: 'text', text: s })
  }
  for (const t of toks) {
    switch (t.t) {
      case 'text':
        text(t.s, marks)
        break
      case 'code':
        // In the editor, code can't be bold or a link at the same time: then it is just words.
        text(t.s, marks.length ? marks : [{ type: 'code' }])
        break
      case 'br':
        out.push({ type: 'hardBreak' })
        break
      case 'bold':
      case 'italic':
      case 'strike':
        flatten(t.kids, marks.some((m) => m.type === t.t) ? marks : [...marks, { type: t.t }], out, ctx)
        break
      case 'link': {
        const href = t.href.trim()
        const ok = isSafeLinkHref(href)
        // (t.href, not href: after the check above, TypeScript thinks href can't be a string here.)
        if (!ok) ctx.warnings.push(`The link address "${t.href.trim().slice(0, 100)}" is not allowed, so only its words were kept.`)
        const rest = marks.filter((m) => m.type !== 'link')
        flatten(t.kids, ok ? [...rest, { type: 'link', attrs: { href } }] : rest, out, ctx)
        break
      }
      case 'image': {
        const node = imageNode(t.src, t.alt, ctx)
        if (node) out.push(node)
        break
      }
      case 'delim':
        text(t.ch.repeat(t.n), marks)
        break
    }
  }
}

function imageNode(src: string, alt: string, ctx: Ctx): NoteNode | null {
  const address = src.trim()
  const key = /^picture:([0-9a-f]{8})$/i.exec(address)
  if (key) {
    const old = ctx.pictures.get(key[1]!.toLowerCase())
    if (!old) {
      ctx.warnings.push(`${address} is not a picture in this note, so it was left out. Pasted pictures can be kept, moved or deleted. New pictures need a web address (https://…).`)
      return null
    }
    return { type: 'image', attrs: { ...old.attrs, alt: alt || (old.attrs?.alt ?? null) } }
  }
  if (!/^https?:\/\/\S+$/i.test(address)) {
    ctx.warnings.push(`The picture "${address.slice(0, 100)}" was left out: a picture needs a web address (https://…).`)
    return null
  }
  const old = ctx.media.get(address)
  const attrs: Record<string, unknown> = { src: address, alt: alt || null, title: null }
  if (old?.type === 'image') {
    attrs.width = old.attrs?.width ?? null
    attrs.height = old.attrs?.height ?? null
  }
  return { type: 'image', attrs }
}
