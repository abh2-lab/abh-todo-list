import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { aiKeys, users } from '../../db/schema'
import { useDb } from '../db'
import { withoutNul } from '#shared/text'

// Personal keys for AI apps (the MCP connection, server/routes/mcp.ts). See db/schema.ts.
// A key is "nk_" + 43 random characters. Only its SHA-256 hash is kept.

/** One person can have this many keys. */
export const MAX_AI_KEYS = 10
const MAX_KEY_NAME = 60
const KEY_RE = /^nk_[A-Za-z0-9_-]{43}$/

/** A new key: the key itself (shown once), its hash (kept), and its first characters (shown in the list). */
export function newAiKey() {
  const key = `nk_${randomBytes(32).toString('base64url')}`
  return { key, hash: hashAiKey(key), start: key.slice(0, 7) }
}

export function hashAiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** A key name without extra spaces (at most 60 characters), or null when it is empty. */
export function cleanKeyName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = withoutNul(value).replace(/\s+/g, ' ').trim().slice(0, MAX_KEY_NAME).trim()
  return name || null
}

export interface AiCaller {
  keyId: string
  keyName: string
  user: { id: string; name: string; email: string }
}

/** The key in "Authorization: Bearer <key>", or null. */
function bearerKey(event: H3Event): string | null {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header)
  return m && KEY_RE.test(m[1]!) ? m[1]! : null
}

/**
 * Who is calling: the person whose key is in the Authorization header, or null when there is
 * no key or it is not (or no longer) a key. Notes when the key was last used (at most once a minute).
 */
export async function aiCaller(event: H3Event): Promise<AiCaller | null> {
  const key = bearerKey(event)
  if (!key) return null
  const db = useDb()
  const [row] = await db
    .select({
      keyId: aiKeys.id,
      keyName: aiKeys.name,
      lastUsedAt: aiKeys.lastUsedAt,
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(aiKeys)
    .innerJoin(users, eq(users.id, aiKeys.userId))
    .where(eq(aiKeys.keyHash, hashAiKey(key)))
  if (!row) return null
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(aiKeys).set({ lastUsedAt: new Date() }).where(eq(aiKeys.id, row.keyId))
  }
  return { keyId: row.keyId, keyName: row.keyName, user: { id: row.id, name: row.name, email: row.email } }
}

// ---- How often a key may call ----
// At most 240 calls a minute for each key: plenty for an AI app, and a runaway one is stopped.
// Counted in the server's memory (it starts over when the server restarts).
const WINDOW_MS = 60_000
const MAX_CALLS = 240
const calls = new Map<string, number[]>()
let lastSweep = Date.now()

/** false when this key made too many calls in the last minute. Otherwise counts this call. */
export function aiCallAllowed(keyId: string): boolean {
  const now = Date.now()
  if (now - lastSweep > 10 * WINDOW_MS) {
    lastSweep = now
    for (const [id, times] of calls) if (times[times.length - 1]! <= now - WINDOW_MS) calls.delete(id)
  }
  const times = (calls.get(keyId) ?? []).filter((t) => t > now - WINDOW_MS)
  if (times.length >= MAX_CALLS) {
    calls.set(keyId, times)
    return false
  }
  times.push(now)
  calls.set(keyId, times)
  return true
}
