// Days are kept as text like 2026-11-09, always in the person's own time,
// so "today" and "midnight" follow their phone or computer clock.

export function toDayKey(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function todayKey(): string {
  return toDayKey(new Date())
}

export function fromDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

/** "Fri, 6 Nov" */
export function shortDay(key: string): string {
  return fromDayKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "Monday, 9 November" */
export function longDay(key: string): string {
  return fromDayKey(key).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** The 42 days (6 weeks, Monday first) the calendar shows for a month. */
export function monthGrid(year: number, month: number): string[] {
  const offset = (new Date(year, month, 1).getDay() + 6) % 7 // Monday = 0
  return Array.from({ length: 42 }, (_, i) => toDayKey(new Date(year, month, 1 - offset + i)))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The name of a new private note: "9 Nov 2026, Monday". */
export function noteDateTitle(d: Date = new Date()): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`
}

/** A day plus some days: addDays('2026-11-09', 1) = '2026-11-10'. */
export function addDays(key: string, days: number): string {
  const d = fromDayKey(key)
  d.setDate(d.getDate() + days)
  return toDayKey(d)
}

/** Whole days from one day to another: daysBetween('2026-11-09', '2026-11-11') = 2. */
export function daysBetween(from: string, to: string): number {
  return Math.round((fromDayKey(to).getTime() - fromDayKey(from).getTime()) / 86_400_000)
}

/** "6 Nov": the day and the month only. */
export function dayMonth(key: string): string {
  return fromDayKey(key).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

interface DoneTask {
  day: string
  movedFrom: string | null
  doneDay?: string | null
  doneAt?: string | null
}

/** The day a task was done, like 2026-11-12 (null if it is not done). */
export function doneDayOf(task: Pick<DoneTask, 'doneDay' | 'doneAt'>): string | null {
  // Tasks done before the day was saved: the day of the time it was done, in this computer's time.
  return task.doneDay ?? (task.doneAt ? toDayKey(new Date(task.doneAt)) : null)
}

/**
 * A done task took this many days: from its first planned day to the day it was done,
 * both days counted (1 = done on its planned day). Null if it is not done.
 */
export function tookDays(task: DoneTask): number | null {
  const end = doneDayOf(task)
  if (!end) return null
  return Math.max(1, daysBetween(task.movedFrom ?? task.day, end) + 1)
}

/**
 * A task done on a later day than first planned: "Completed in 3 days (10 Nov → 12 Nov)".
 * Empty for a task done on its planned day, and for a task that is not done.
 */
export function completedText(task: DoneTask): string {
  const n = tookDays(task)
  if (!n || n < 2) return ''
  return `Completed in ${n} days (${dayMonth(task.movedFrom ?? task.day)} → ${dayMonth(doneDayOf(task)!)})`
}

// ---- Months, like "2026-09" (share links of Daily tasks) ----

/** The month of a date: "2026-09". */
export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-09" → "Sep 2026" (or "September 2026" with style 'long'). */
export function monthName(key: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y!, m! - 1, 1).toLocaleDateString(undefined, { month: style, year: 'numeric' })
}

/** "Sep 2026 – Dec 2026", or just "Sep 2026" for one month. */
export function monthRange(from: string, to: string, style: 'short' | 'long' = 'short'): string {
  return from === to ? monthName(from, style) : `${monthName(from, style)} – ${monthName(to, style)}`
}

/** How many months from one month to another, both counted: "2026-09" … "2026-12" = 4. */
export function monthCount(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number)
  const [ty, tm] = to.split('-').map(Number)
  return (ty! - fy!) * 12 + (tm! - fm!) + 1
}
