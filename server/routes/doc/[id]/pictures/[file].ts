import { and, eq } from 'drizzle-orm'
import { documents } from '../../../../../db/schema'
import { useDb } from '../../../../db'
import { isBoardImage } from '#shared/board'
import { cleanNoteContent } from '#shared/noteContent'
import { findPastedPicture } from '#shared/notePictures'

// A picture pasted into a note, at its own address: /doc/<note id>/pictures/<key>.png.
// "Copy for AI" and the view-only page link to it, so an AI chat can open the picture
// (shared/notePictures.ts). Same rule as the view-only page: public notes, private notes with
// the view-only link on, and your own notes. Never a note in the Trash.
// This file answers every method (not only GET), so a HEAD request gets the picture's
// headers here instead of the app's page.

// <key> or <key>.<extension>
const FILE = /^([0-9a-f]{16})(?:\.[a-z0-9]{1,5})?$/i

export default defineEventHandler(async (event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD') {
    setResponseHeader(event, 'Allow', 'GET, HEAD')
    throw createError({ statusCode: 405, message: 'Pictures can only be opened.' })
  }
  // Same answer for every miss: we don't tell strangers which notes or pictures exist.
  const notFound = () => createError({ statusCode: 404, message: 'Picture not found' })
  const id = getRouterParam(event, 'id', { decode: true }) ?? ''
  const key = FILE.exec(getRouterParam(event, 'file', { decode: true }) ?? '')?.[1]?.toLowerCase()
  if (!id || id.length > 100 || !key) throw notFound()

  const { user } = await getUserSession(event)
  const [doc] = await useDb()
    .select({ content: documents.content })
    .from(documents)
    .where(and(eq(documents.id, id), viewableBy(user?.id)))
  if (!doc) throw notFound()

  const base64 = findPastedPicture(cleanNoteContent(doc.content), key)
  if (base64 === null) throw notFound()
  // Only real pictures, from their first bytes: never something that only claims to be one.
  const data = Buffer.from(base64, 'base64')
  const type = sniffType(data)
  if (!type || !isBoardImage(type)) throw notFound()

  setResponseHeaders(event, {
    'Content-Type': type,
    'Content-Length': String(data.length),
    // The owner can turn the view-only link off, so only the visitor's own browser keeps it, for an hour.
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    // AI chats may show it on their own pages.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    // Nothing in it can run as part of this site.
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  })
  return data
})
