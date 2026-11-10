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

/** A done task took this many days: from its first planned day to the day it was done (1 = same day). */
export function tookDays(task: { day: string; movedFrom: string | null; doneAt: string | null }): number | null {
  if (!task.doneAt) return null
  const start = task.movedFrom ?? task.day
  return Math.max(1, daysBetween(start, toDayKey(new Date(task.doneAt))) + 1)
}
