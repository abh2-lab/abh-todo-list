import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { and, eq } from 'drizzle-orm'
import { useDb } from '../../db'
import { boardFiles } from '../../../db/schema'
import { opensInBrowser } from '#shared/board'

// A picture or file from a board, for its owner only. Pictures and PDFs are shown in the
// browser; other files (and ?download) are downloaded, never shown as a page.
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id') ?? ''
  const notFound = () => createError({ statusCode: 404, message: 'File not found' })
  if (!isBoardFileId(id)) throw notFound()

  const [file] = await useDb()
    .select()
    .from(boardFiles)
    .where(and(eq(boardFiles.id, id), eq(boardFiles.userId, user.id)))
  if (!file) throw notFound()

  let size: number
  try {
    size = (await stat(boardFilePath(id))).size
  } catch {
    throw notFound()
  }

  const inline = opensInBrowser(file.type) && getQuery(event).download === undefined
  setResponseHeaders(event, {
    'Content-Type': inline ? file.type : 'application/octet-stream',
    'Content-Length': String(size),
    'Content-Disposition': fileDisposition(inline ? 'inline' : 'attachment', file.name),
    // A file never changes (a new upload gets a new id). "private": only this person's browser keeps it.
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    // Other sites can't put it on their pages.
    'Cross-Origin-Resource-Policy': 'same-origin',
    // Nothing in the file can run as part of this site. (The browser's PDF viewer does not work
    // in a "sandbox", so PDFs get the rule that keeps other sites from framing them.)
    'Content-Security-Policy': inline && file.type === 'application/pdf'
      ? "frame-ancestors 'self'"
      : "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  })
  return sendStream(event, createReadStream(boardFilePath(id)))
})
