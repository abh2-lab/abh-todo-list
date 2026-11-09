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
