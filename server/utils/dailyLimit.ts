import type { H3Event } from 'h3'

// Counts things people do (like making a new note), so one person can't do it
// thousands of times. The counts live in the server's memory: they start over
// when the server restarts (for example after a deploy).

const DAY_MS = 24 * 60 * 60 * 1000
const SWEEP_EVERY_MS = 10 * 60 * 1000

// "what:who" → when they did it (at most `max` times are kept)
const done = new Map<string, number[]>()
let lastSweep = Date.now()

/** Forget people who did nothing in the last 24 hours, so the list doesn't keep growing. */
function sweep(now: number) {
  if (now - lastSweep < SWEEP_EVERY_MS) return
  lastSweep = now
  for (const [key, times] of done) {
    if (times[times.length - 1]! <= now - DAY_MS) done.delete(key)
  }
}

/**
 * Who is asking: their account when logged in, otherwise their internet address.
 * Behind Coolify's proxy, the address is the last one in X-Forwarded-For (the proxy adds it).
 * Anything before it was sent by the browser and can be made up.
 */
export function requesterKey(event: H3Event, userId: string | undefined): string {
  if (userId) return `user:${userId}`
  const forwarded = getRequestHeader(event, 'x-forwarded-for')
  const last = forwarded?.split(',').map((s) => s.trim()).filter(Boolean).pop()
  return `ip:${addressGroup(last || event.node.req.socket.remoteAddress || 'unknown')}`
}

/**
 * One home or phone often gets a whole block of IPv6 addresses (the first half is the same).
 * Count that block as one, or someone could use a new address for every note.
 */
function addressGroup(ip: string): string {
  // IPv4, also when it is written the IPv6 way (::ffff:1.2.3.4)
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip)
  if (v4) return v4[1]!
  if (!ip.includes(':')) return ip
  // Write the IPv6 address out in full ("::" = some zero parts), then keep its first 4 parts.
  const [head = '', tail = ''] = ip.toLowerCase().split('%')[0]!.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = Math.max(0, 8 - headParts.length - tailParts.length)
  const full = [...headParts, ...Array<string>(missing).fill('0'), ...tailParts]
  return full.slice(0, 4).map((p) => p.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}

/**
 * Stop with "429 Too Many Requests" if `key` already did this `max` times in the last 24 hours.
 * Otherwise count this time.
 */
export function useDailyLimit(what: string, key: string, max: number, message: string) {
  const now = Date.now()
  sweep(now)
  const id = `${what}:${key}`
  const times = (done.get(id) ?? []).filter((t) => t > now - DAY_MS)
  if (times.length >= max) {
    done.set(id, times)
    throw createError({ statusCode: 429, message })
  }
  times.push(now)
  done.set(id, times)
}
