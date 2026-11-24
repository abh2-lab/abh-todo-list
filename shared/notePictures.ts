// Pictures pasted into a note are kept inside the note, as text (data:image/png;base64,…).
// So they have no web address of their own, and an AI chat that gets the note as text
// ("Copy for AI", or the view-only page) could not open them.
// Now each one has an address under the note's view-only link:
//   /doc/<note id>/pictures/<key>.png   (server/routes/doc/[id]/pictures/[file].ts)
// It works for the same people as the view-only page: everyone for a public note or for a
// private note with the view-only link on, only the owner for a private note without it.
// Never for a note in the Trash. The key comes from the picture itself, so the same picture
// always has the same address.

import type { NoteNode } from './noteContent'

/** The kinds of pasted pictures that get an address (the server checks their first bytes too). Not SVG: it can carry scripts. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

// data:<type>[;name=value…];base64,<data>
const PASTED = /^data:(image\/[\w.+-]+)(?:;[\w.+-]+=[^;,]*)*;base64,/i

/** A key is 16 hex digits. */
export const PICTURE_KEY = /^[0-9a-f]{16}$/

const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')

/** A short key made from all of the picture's text: the same picture always gets the same key. */
export function pastedPictureKey(src: string): string {
  // Two 32-bit hashes (FNV-1a with two different multipliers), mixed at the end.
  // Quick, and the same in the browser and on the server.
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ c, 0x5bd1e995)
  }
  a = Math.imul(a ^ (a >>> 16), 0x85ebca6b) ^ b
  b = Math.imul(b ^ (b >>> 13), 0xc2b2ae35) ^ a
  return hex(a) + hex(b)
}

/** Where a pasted picture of this note can be opened (it starts with "/doc/"), or null when it gets no address. */
export function notePicturePath(docId: string, src: string): string | null {
  const type = PASTED.exec(src)?.[1]?.toLowerCase()
  const extension = type ? EXTENSIONS[type] : undefined
  return extension ? `/doc/${encodeURIComponent(docId)}/pictures/${pastedPictureKey(src)}.${extension}` : null
}

/** The data (base64) of the pasted picture in this note that has this key, or null. */
export function findPastedPicture(doc: NoteNode | null, key: string): string | null {
  if (!doc || !PICTURE_KEY.test(key)) return null
  const walk = (node: NoteNode): string | null => {
    const src = node.attrs?.src
    if (node.type === 'image' && typeof src === 'string') {
      const start = PASTED.exec(src)
      if (start && EXTENSIONS[start[1]!.toLowerCase()] && pastedPictureKey(src) === key) return src.slice(start[0].length)
    }
    for (const child of node.content ?? []) {
      const found = walk(child)
      if (found !== null) return found
    }
    return null
  }
  return walk(doc)
}
