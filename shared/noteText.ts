// A note as plain text, for AI chats (ChatGPT, Claude, Gemini…) and other tools:
// - noteToMarkdown / noteForAi: what the "Copy for AI" button (Share menu) copies.
// - noteToHtml: the view-only page (/doc/<id>) carries this copy of the note, so AI tools
//   that read a page without running its JavaScript still get the text
//   (server/plugins/note-text-for-ai.ts).
// The note is cleaned first (shared/noteContent.ts). Pictures from a web address keep the address.
// Pictures pasted into a note are big, so their data is left out: given a way to find their
// web address (shared/notePictures.ts), they show as a link to the picture, so an AI can open
// it; otherwise (and for kinds that get no address, like SVG) they show as "[picture]".

import { cleanNoteContent, isSafeLinkHref, youtubeSrc, type NoteNode } from './noteContent'

/** The web address of a pasted picture (data:image/…), or null when it has none. */
export type PictureAddress = (src: string) => string | null

/** The cleaned note, with each pasted picture swapped for its web address (when it has one). */
function cleanWithAddresses(content: unknown, address?: PictureAddress): NoteNode | null {
  const doc = cleanNoteContent(content)
  if (!doc || !address) return doc
  // The cleaned note is a new copy, so it can be changed here.
  const walk = (node: NoteNode) => {
    const src = node.attrs?.src
    if (node.type === 'image' && typeof src === 'string' && src.startsWith('data:')) {
      const url = address(src)
      if (url) node.attrs!.src = url
    }
    node.content?.forEach(walk)
  }
  walk(doc)
  return doc
}

const hasMark = (node: NoteNode, type: string) => (node.marks ?? []).some((m) => m.type === type)

function linkOf(node: NoteNode): string | null {
  const href = (node.marks ?? []).find((m) => m.type === 'link')?.attrs?.href
  return isSafeLinkHref(href) ? href.trim() : null
}

/** A web address of a picture (http or https), or null (pasted pictures, or no address). */
function webPicture(node: NoteNode): string | null {
  const src = node.attrs?.src
  return typeof src === 'string' && /^https?:\/\//i.test(src.trim()) ? src.trim() : null
}

function pictureName(node: NoteNode): string {
  const alt = node.attrs?.alt
  return typeof alt === 'string' && alt.trim() ? alt.trim() : ''
}

function headingLevel(node: NoteNode): number {
  const level = Number(node.attrs?.level)
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1
}

function listStart(node: NoteNode): number {
  const start = Number(node.attrs?.start)
  return Number.isInteger(start) && start >= 0 && start < 1e9 ? start : 1
}

/** All the text in a node, with nothing else (for code blocks). */
function plainText(node: NoteNode): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(plainText).join('')
}

// ---------------------------------------------------------------------------------------
// Markdown

/** "**…**" around the words, with spaces at the ends kept outside (Markdown needs that). */
function wrap(text: string, mark: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
  if (!m || !m[2]) return text
  return `${m[1]}${mark}${m[2]}${mark}${m[3]}`
}

/** An address that can't end the Markdown link early: spaces and brackets are written as %xx. */
function mdAddress(address: string): string {
  return address.replace(/[\s()<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)
}

function pictureMd(node: NoteNode): string {
  const name = pictureName(node)
  const src = webPicture(node)
  if (src) return `![${name || 'picture'}](${mdAddress(src)})`
  return name ? `[picture: ${name}]` : '[picture]'
}

function textMd(node: NoteNode): string {
  let text = node.text ?? ''
  if (hasMark(node, 'code')) {
    const ticks = text.includes('`') ? '``' : '`'
    const space = ticks.length > 1 ? ' ' : ''
    text = `${ticks}${space}${text}${space}${ticks}`
  } else {
    if (hasMark(node, 'bold')) text = wrap(text, '**')
    if (hasMark(node, 'italic')) text = wrap(text, '*')
    if (hasMark(node, 'strike')) text = wrap(text, '~~')
  }
  const href = linkOf(node)
  return href ? `[${text}](${mdAddress(href)})` : text
}

function inlineMd(nodes: NoteNode[] | undefined): string {
  let out = ''
  for (const node of nodes ?? []) {
    if (node.type === 'text') out += textMd(node)
    else if (node.type === 'hardBreak') out += '\n'
    else if (node.type === 'image') out += pictureMd(node)
    else out += inlineMd(node.content)
  }
  return out
}

/** Every line but the first starts with `pad` (the text under a list marker). */
function indentRest(text: string, pad: string): string {
  return text.split('\n').map((line, i) => (i === 0 || line === '' ? line : pad + line)).join('\n')
}

function prefixLines(text: string, prefix: string): string {
  return text.split('\n').map((line) => (line === '' ? prefix.trimEnd() : prefix + line)).join('\n')
}

function listMd(list: NoteNode, marker: (i: number, item: NoteNode) => string, pad?: number): string {
  return (list.content ?? []).map((item, i) => {
    const m = marker(i, item)
    const body = blocksMd(item.content).join('\n')
    return indentRest(m + body, ' '.repeat(pad ?? m.length))
  }).join('\n')
}

function tableMd(table: NoteNode): string {
  const rows = (table.content ?? []).map((row) => (row.content ?? []).map((cell) =>
    blocksMd(cell.content).join(' ').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim()))
  if (rows.length === 0) return ''
  const width = Math.max(1, ...rows.map((r) => r.length))
  const line = (r: string[]) => `| ${[...r, ...Array(width - r.length).fill('')].join(' | ')} |`
  const [head, ...rest] = rows
  return [line(head!), `|${' --- |'.repeat(width)}`, ...rest.map(line)].join('\n')
}

function blockMd(node: NoteNode): string {
  switch (node.type) {
    case 'paragraph':
      return inlineMd(node.content)
    case 'heading':
      return `${'#'.repeat(headingLevel(node))} ${inlineMd(node.content).replace(/\n/g, ' ')}`
    case 'blockquote':
      return prefixLines(blocksMd(node.content).join('\n\n'), '> ')
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
      return listMd(node, () => '- ')
    case 'orderedList': {
      const start = listStart(node)
      return listMd(node, (i) => `${start + i}. `)
    }
    case 'taskList':
      return listMd(node, (_i, item) => `- [${item.attrs?.checked ? 'x' : ' '}] `, 2)
    case 'image':
      return pictureMd(node)
    case 'youtube': {
      const src = youtubeSrc(node.attrs?.src)
      return src ? `[YouTube video](${mdAddress(src)})` : ''
    }
    case 'table':
      return tableMd(node)
    default:
      return node.content ? blocksMd(node.content).join('\n\n') : (node.text ?? '')
  }
}

function blocksMd(nodes: NoteNode[] | undefined): string[] {
  return (nodes ?? []).map(blockMd).filter((b) => b.trim() !== '')
}

/** A note as Markdown (empty for an empty note). */
export function noteToMarkdown(content: unknown, pictureAddress?: PictureAddress): string {
  const doc = cleanWithAddresses(content, pictureAddress)
  return doc ? blocksMd(doc.content).join('\n\n').trim() : ''
}

/** The first words of a note, as plain text (for its card on a board). */
export function notePreview(content: unknown, max = 240): string {
  const doc = cleanNoteContent(content)
  if (!doc) return ''
  const words: string[] = []
  let length = 0
  const walk = (node: NoteNode) => {
    if (length >= max) return
    if (node.type === 'text' && node.text) {
      words.push(node.text)
      length += node.text.length
    }
    for (const child of node.content ?? []) walk(child)
    if (node.type !== 'text') words.push(' ')
  }
  walk(doc)
  const text = words.join('').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text
}

/**
 * What "Copy for AI" copies: the name of the note, its view-only link, and the note as Markdown.
 * Pasted pictures become links to the pictures (with `pictureAddress`), so the AI can open them.
 */
export function noteForAi(title: string, link: string, content: unknown, pictureAddress?: PictureAddress): string {
  const name = title.trim().replace(/\s+/g, ' ') || 'Untitled'
  const doc = cleanWithAddresses(content, pictureAddress)
  const body = doc ? blocksMd(doc.content).join('\n\n').trim() : ''
  const pictures = doc && hasPictureLink(doc) ? '\nPictures in this note are links: open a link to see the picture.\n' : ''
  return `# ${name}\n\nShared note: ${link}\n${pictures}\n${body || '(This note is empty.)'}\n`
}

/** Does the note have a picture with a web address? */
function hasPictureLink(node: NoteNode): boolean {
  return (node.type === 'image' && webPicture(node) !== null) || (node.content ?? []).some(hasPictureLink)
}

// ---------------------------------------------------------------------------------------
// HTML (the copy inside the view-only page). Everything from the note is escaped.

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}

const REL = 'nofollow noopener noreferrer'

function pictureHtml(node: NoteNode): string {
  const name = pictureName(node)
  const label = escapeHtml(name ? `[picture: ${name}]` : '[picture]')
  const src = webPicture(node)
  // A link, not an <img>: people's browsers would load the picture even though this copy is hidden.
  return src ? `<a href="${escapeHtml(src)}" rel="${REL}">${label}</a>` : label
}

function textHtml(node: NoteNode): string {
  let html = escapeHtml(node.text ?? '')
  if (hasMark(node, 'code')) html = `<code>${html}</code>`
  if (hasMark(node, 'bold')) html = `<strong>${html}</strong>`
  if (hasMark(node, 'italic')) html = `<em>${html}</em>`
  if (hasMark(node, 'strike')) html = `<s>${html}</s>`
  const href = linkOf(node)
  return href ? `<a href="${escapeHtml(href)}" rel="${REL}">${html}</a>` : html
}

function inlineHtml(nodes: NoteNode[] | undefined): string {
  let out = ''
  for (const node of nodes ?? []) {
    if (node.type === 'text') out += textHtml(node)
    else if (node.type === 'hardBreak') out += '<br>'
    else if (node.type === 'image') out += pictureHtml(node)
    else out += inlineHtml(node.content)
  }
  return out
}

/** A list item: its first paragraph as plain text (no <p>), then the rest. */
function itemHtml(item: NoteNode, before = ''): string {
  const [first, ...rest] = item.content ?? []
  const head = first?.type === 'paragraph' ? inlineHtml(first.content) : first ? blockHtml(first) : ''
  return `<li>${before}${head}${blocksHtml(rest)}</li>`
}

function blockHtml(node: NoteNode): string {
  switch (node.type) {
    case 'paragraph': {
      const inner = inlineHtml(node.content)
      return inner ? `<p>${inner}</p>` : ''
    }
    case 'heading': {
      const level = headingLevel(node)
      return `<h${level}>${inlineHtml(node.content)}</h${level}>`
    }
    case 'blockquote':
      return `<blockquote>${blocksHtml(node.content)}</blockquote>`
    case 'codeBlock':
      return `<pre><code>${escapeHtml(plainText(node))}</code></pre>`
    case 'horizontalRule':
      return '<hr>'
    case 'bulletList':
      return `<ul>${(node.content ?? []).map((item) => itemHtml(item)).join('')}</ul>`
    case 'orderedList': {
      const start = listStart(node)
      return `<ol${start !== 1 ? ` start="${start}"` : ''}>${(node.content ?? []).map((item) => itemHtml(item)).join('')}</ol>`
    }
    case 'taskList':
      return `<ul>${(node.content ?? []).map((item) => itemHtml(item, item.attrs?.checked ? '[x] ' : '[ ] ')).join('')}</ul>`
    case 'image':
      return `<p>${pictureHtml(node)}</p>`
    case 'youtube': {
      const src = youtubeSrc(node.attrs?.src)
      return src ? `<p><a href="${escapeHtml(src)}" rel="${REL}">YouTube video</a></p>` : ''
    }
    case 'table':
      return `<table>${(node.content ?? []).map((row) => `<tr>${(row.content ?? []).map((cell) => {
        const tag = cell.type === 'tableHeader' ? 'th' : 'td'
        return `<${tag}>${blocksHtml(cell.content)}</${tag}>`
      }).join('')}</tr>`).join('')}</table>`
    default:
      return node.content ? blocksHtml(node.content) : escapeHtml(node.text ?? '')
  }
}

function blocksHtml(nodes: NoteNode[] | undefined): string {
  return (nodes ?? []).map(blockHtml).join('')
}

/** A note as simple HTML (headings, lists, tables, links), all text escaped. */
export function noteToHtml(content: unknown, pictureAddress?: PictureAddress): string {
  const doc = cleanWithAddresses(content, pictureAddress)
  return doc ? blocksHtml(doc.content) : ''
}
