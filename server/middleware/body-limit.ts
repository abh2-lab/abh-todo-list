// A limit on how big a request can be.
// The server keeps the whole request in memory while it reads it. Without a limit, one
// huge request (say 5 GB) could use up all the memory and stop the app for everyone.
// The biggest note today is about 4 MB. Pasted pictures are kept inside the note, so
// we leave a lot of room: 50 MB.
import type { IncomingMessage } from 'node:http'

const MAX_BYTES = 50 * 1024 * 1024
// Where h3 (the server library) looks for a body that was already read.
const READ_BODY = Symbol.for('h3RawBody')

const tooBig = () => createError({ statusCode: 413, message: 'Too big: a request can be at most 50 MB.' })

export default defineEventHandler((event) => {
  if (event.method === 'GET' || event.method === 'HEAD') return
  const req = event.node.req

  // The request says how big it is: refuse it before reading it.
  const length = Number.parseInt(req.headers['content-length'] || '')
  if (length > MAX_BYTES) throw tooBig()
  if (length || !/\bchunked\b/i.test(String(req.headers['transfer-encoding'] ?? ''))) return

  // The request comes in parts and doesn't say how big it is: read it here and count.
  // h3 uses what we read, instead of reading it again.
  const body = new Promise<Buffer>((resolve, reject) => {
    const parts: Buffer[] = []
    let size = 0
    const onData = (part: Buffer) => {
      size += part.length
      if (size > MAX_BYTES) {
        req.off('data', onData) // the rest is thrown away, not kept
        parts.length = 0
        reject(tooBig())
        return
      }
      parts.push(part)
    }
    req.on('data', onData)
    req.on('end', () => resolve(Buffer.concat(parts)))
    req.on('error', reject)
  })
  body.catch(() => {}) // a route that doesn't read the body must not see an unhandled error
  ;(req as IncomingMessage & { [READ_BODY]?: Promise<Buffer> })[READ_BODY] = body
})
