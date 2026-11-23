// Pictures and files on boards: uploading them, and how their cards show them.
import { MAX_FILE_MB } from '#shared/board'

/** What the server says about a file after it was uploaded. */
export interface UploadedFile {
  id: string
  name: string
  type: string
  size: number
}

/** The address of an uploaded file (?download: always download it, never show it). */
export function fileUrl(fileId: string, download = false): string {
  return `/api/files/${encodeURIComponent(fileId)}${download ? '?download' : ''}`
}

/** A file size for people, like "820 KB" or "2.4 MB". */
export function fileSizeText(bytes: number | undefined): string {
  if (bytes === undefined) return ''
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A short name for the kind of file, from the end of its name: "PDF", "DOCX", or "File". */
export function fileKindText(name: string | undefined, type: string | undefined): string {
  const end = /\.([a-z0-9]{1,8})$/i.exec(name ?? '')?.[1]
  if (end) return end.toUpperCase()
  return type === 'application/pdf' ? 'PDF' : 'File'
}

/** Why an upload did not work (status 0 = no connection, -1 = stopped). */
export class UploadError extends Error {
  constructor(public status: number, message?: string) {
    super(message || (status === 0 ? 'The file could not be uploaded. Check your connection and try again.' : 'The file could not be uploaded.'))
  }
}

/**
 * Upload a file for a group's board. onProgress gets how much is sent (0 to 1).
 * (XMLHttpRequest, not fetch: fetch can't tell how much of an upload is sent.)
 */
export function uploadBoardFile(
  groupId: string,
  file: File,
  onProgress?: (part: number) => void,
  signal?: AbortSignal,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/groups/${encodeURIComponent(groupId)}/files`)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      const answer = xhr.response as (UploadedFile & { message?: string }) | null
      if (xhr.status >= 200 && xhr.status < 300 && answer?.id) resolve(answer)
      else if (xhr.status === 413 && !answer?.message) reject(new UploadError(413, `Too big: a file can be at most ${MAX_FILE_MB} MB.`))
      else reject(new UploadError(xhr.status, answer?.message))
    }
    xhr.onerror = () => reject(new UploadError(0))
    xhr.onabort = () => reject(new UploadError(-1))
    if (signal?.aborted) return reject(new UploadError(-1))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    const form = new FormData()
    form.append('file', file, file.name)
    xhr.send(form)
  })
}
