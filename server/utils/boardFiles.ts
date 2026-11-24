import { mkdir, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { withoutNul } from '#shared/text'
import { FILE_TYPE, MAX_FILE_NAME, opensInBrowser } from '#shared/board'

// Pictures and files put on boards. Each one is a file in the uploads folder, named by its id
// (no extension, so nothing ever runs it), and a row in board_files (db/schema.ts).

/** All the files of one person can take this much room on the server. */
export const MAX_USER_FILE_BYTES = 2 * 1024 * 1024 * 1024
/** A board can hold this many files (with the ones taken off it in the last days). */
export const MAX_GROUP_FILES = 500
/** One person can upload this many files a day. */
export const MAX_FILES_PER_DAY = 300
/** A file taken off its board is kept this many days (Ctrl+Z can bring its card back), then deleted. */
export const UNUSED_FILE_DAYS = 7

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The uploads folder: UPLOADS_DIR, or "uploads" in the folder the server runs in (/app/uploads in Docker). */
export function uploadsDir(): string {
  return resolve(process.env.UPLOADS_DIR || 'uploads')
}

export function isBoardFileId(id: string): boolean {
  return UUID.test(id)
}

export function boardFilePath(id: string): string {
  if (!isBoardFileId(id)) throw new Error('not a file id')
  return join(uploadsDir(), id)
}

/** What a file is, from its first bytes (only the kinds the browser may show), or null. */
export function sniffType(data: Buffer): string | null {
  const ascii = (from: number, to: number) => data.subarray(from, to).toString('latin1')
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg'
  if (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a') return 'image/gif'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(4, 12) === 'ftypavif') return 'image/avif'
  if (ascii(0, 5) === '%PDF-') return 'application/pdf'
  return null
}

/**
 * What a new file is. Pictures and PDFs (the files the browser shows) are only what their first
 * bytes say: a file that only claims to be one is kept as a plain file, which is always downloaded.
 */
export function boardFileType(data: Buffer, claimed: string | undefined): string {
  const sniffed = sniffType(data)
  if (sniffed) return sniffed
  const type = (claimed ?? '').toLowerCase()
  return FILE_TYPE.test(type) && !opensInBrowser(type) ? type : 'application/octet-stream'
}

/** A file name without folders, control characters or extra spaces (at most 200 characters). */
export function cleanFileName(value: string | undefined): string {
  const name = withoutNul(value ?? '')
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FILE_NAME)
    .trim()
  return name || 'file'
}

/** Save a new file in the uploads folder. */
export async function saveBoardFile(id: string, data: Buffer) {
  await mkdir(uploadsDir(), { recursive: true })
  // "wx": never write over a file that is already there.
  await writeFile(boardFilePath(id), data, { flag: 'wx', mode: 0o600 })
}

/** Delete files from the uploads folder (the ones that are already gone are skipped). */
export async function removeBoardFiles(ids: string[]) {
  for (const id of ids) {
    if (!isBoardFileId(id)) continue
    try {
      await unlink(boardFilePath(id))
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') console.error(`[files] could not delete ${id}:`, (e as Error).message)
    }
  }
}

/** The files in the uploads folder that were last changed before `before` (ms), by id. */
export async function oldFilesInFolder(before: number): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(uploadsDir())
  } catch {
    return [] // no folder yet: nothing was uploaded
  }
  const ids: string[] = []
  for (const name of names) {
    if (!isBoardFileId(name)) continue
    try {
      const s = await stat(join(uploadsDir(), name))
      if (s.isFile() && s.mtimeMs < before) ids.push(name)
    } catch {
      // Deleted in between.
    }
  }
  return ids
}

/** The Content-Disposition header: show the file in the browser ("inline") or download it, with its name. */
export function fileDisposition(how: 'inline' | 'attachment', name: string): string {
  // Old browsers read only "filename" (plain letters); the others read "filename*" (any letters).
  const plain = name.replace(/[^\x20-\x7e]|["\\%;]/g, '_')
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return `${how}; filename="${plain}"; filename*=UTF-8''${encoded}`
}
