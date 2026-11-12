import { taskShares } from '../../db/schema'

// Share links for Daily tasks ("Share" in Daily tasks): someone's tasks for some months, view only.

/** One link can show at most this many months. */
export const MAX_SHARE_MONTHS = 24
/** One person can have at most this many links. */
export const MAX_SHARES = 20

const MONTH_RE = /^(\d{4})-(\d{2})$/
const LINK_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Read a month like "2026-09". Returns its first day: "2026-09-01". */
export function readMonth(value: unknown, name: string): string {
  const m = MONTH_RE.exec(String(value ?? ''))
  const year = m ? Number(m[1]) : 0
  const month = m ? Number(m[2]) : 0
  if (!m || year < 2000 || year > 2100 || month < 1 || month > 12) {
    throw createError({ statusCode: 400, message: `${name} must be a month like 2026-09` })
  }
  return `${m[1]}-${m[2]}-01`
}

/** The last day of a month: monthEnd("2026-02-01") = "2026-02-28". */
export function monthEnd(firstDay: string): string {
  const [y, m] = firstDay.split('-').map(Number)
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate()
  return `${firstDay.slice(0, 8)}${String(last).padStart(2, '0')}`
}

/** How many months from one month to another, both counted: 2026-09 … 2026-12 = 4. */
export function monthsBetween(fromFirstDay: string, toFirstDay: string): number {
  const [fy, fm] = fromFirstDay.split('-').map(Number)
  const [ty, tm] = toFirstDay.split('-').map(Number)
  return (ty! - fy!) * 12 + (tm! - fm!) + 1
}

/** The link id from the address, or null if it can't be one (then: "not found"). */
export function readShareId(value: unknown): string | null {
  const s = String(value ?? '')
  return LINK_ID_RE.test(s) ? s.toLowerCase() : null
}

/** What the owner's browser gets about one link. */
export function toClientShare(row: typeof taskShares.$inferSelect) {
  return {
    id: row.id,
    from: row.fromMonth.slice(0, 7),
    to: row.toMonth.slice(0, 7),
    createdAt: row.createdAt,
  }
}
