import type { SharedTask } from '~/types/tasks'
import { taskState, type TaskState } from '~/utils/taskStatus'
import { addDays, dayMonth, daysBetween, doneDayOf, fromDayKey, monthCount, monthName, shortDay, toDayKey, tookDays } from '~/utils/days'

// The numbers on the analytics page of a Daily tasks share link.
// A task counts on the day it is planned for (like in the calendar).
// Only "best streak" and "busiest day" use the day each task was done.

/** The task states, in the order the charts show them. */
export const STATES: readonly TaskState[] = ['done', 'late', 'cancelled', 'todo']

export const STATE_NAME: Record<TaskState, string> = {
  done: 'Done',
  late: 'Not done',
  cancelled: 'Cancelled',
  todo: 'Still to do',
}

/** The same colors as the calendar dots (the grey is a little lighter, so it shows on the charts). */
export const STATE_COLOR: Record<TaskState, string> = {
  done: '#22c55e',
  late: '#ef4444',
  cancelled: '#f59e0b',
  todo: '#737373',
}

/** How many tasks are in each state, and in all. */
export type Counts = Record<TaskState | 'total', number>

function noCounts(): Counts {
  return { total: 0, done: 0, late: 0, cancelled: 0, todo: 0 }
}

function addTask(c: Counts, t: SharedTask, today: string) {
  c[taskState(t, today)]++
  c.total++
}

export function countTasks(list: SharedTask[], today: string): Counts {
  const c = noCounts()
  for (const t of list) addTask(c, t, today)
  return c
}

/**
 * The done rate, from 0 to 1: done tasks out of done + not done.
 * Cancelled tasks and tasks still to do are not counted. Null when there is nothing to count.
 */
export function doneRate(c: Counts): number | null {
  const n = c.done + c.late
  return n ? c.done / n : null
}

/** 0.823 → "82%" (and "–" for nothing). */
export function percent(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)}%`
}

/** "1 day", "3 days" */
export function plural(n: number, word: string): string {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`
}

/** The last day of a month: "2026-11" → "2026-11-30". */
export function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return toDayKey(new Date(y!, m!, 0))
}

export type GroupSize = 'day' | 'week' | 'month'

/** Some days together in a chart: one day, 7 days, or one month. */
export interface DayGroup {
  first: string
  last: string
  counts: Counts
  rate: number | null
}

/**
 * The days from `first` to `last`, in groups: each day, each 7 days (counted from `first`:
 * days 1–7, 8–14, …), or each month. Each group counts the tasks planned in it.
 */
export function groupDays(list: SharedTask[], first: string, last: string, size: GroupSize, today: string): DayGroup[] {
  const groups: DayGroup[] = []
  for (let start = first; start <= last;) {
    let end = size === 'day' ? start : size === 'week' ? addDays(start, 6) : lastDayOf(start.slice(0, 7))
    if (end > last) end = last
    groups.push({ first: start, last: end, counts: noCounts(), rate: null })
    start = addDays(end, 1)
  }
  for (const t of list) {
    if (t.day < first || t.day > last) continue
    const n = daysBetween(first, t.day)
    const i = size === 'day' ? n : size === 'week' ? Math.floor(n / 7) : monthCount(first.slice(0, 7), t.day.slice(0, 7)) - 1
    const group = groups[i]
    if (group) addTask(group.counts, t, today)
  }
  for (const g of groups) g.rate = doneRate(g.counts)
  return groups
}

/** The name of a group: "Tue, 10 Nov", "8 Nov – 14 Nov" or "Nov 2026". */
export function groupName(g: DayGroup, size: GroupSize): string {
  if (size === 'day') return shortDay(g.first)
  if (size === 'month') return monthName(g.first.slice(0, 7))
  return g.first === g.last ? dayMonth(g.first) : `${dayMonth(g.first)} – ${dayMonth(g.last)}`
}

export interface WeekdayRow {
  /** "Mon" */
  name: string
  /** "Monday" */
  longName: string
  counts: Counts
  rate: number | null
  /** The day of the week that goes best. */
  best: boolean
}

/** Monday to Sunday: the tasks planned on each day of the week, and how many of them were done. */
export function weekdayRows(list: SharedTask[], today: string): WeekdayRow[] {
  // Mon … Sun (2024-01-01 was a Monday)
  const rows: WeekdayRow[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i)
    return {
      name: d.toLocaleDateString(undefined, { weekday: 'short' }),
      longName: d.toLocaleDateString(undefined, { weekday: 'long' }),
      counts: noCounts(),
      rate: null,
      best: false,
    }
  })
  for (const t of list) addTask(rows[(fromDayKey(t.day).getDay() + 6) % 7]!.counts, t, today)
  for (const r of rows) r.rate = doneRate(r.counts)

  // The best day: the highest done rate (with more done tasks first when two are the same).
  // A day with only 1 or 2 tasks to count only wins when no day has 3 or more.
  const counted = (r: WeekdayRow) => r.counts.done + r.counts.late
  const enough = rows.filter((r) => counted(r) >= 3)
  let best: WeekdayRow | null = null
  for (const r of enough.length ? enough : rows.filter((r) => counted(r) > 0)) {
    if (!best || r.rate! > best.rate! || (r.rate === best.rate && r.counts.done > best.counts.done)) best = r
  }
  if (best) best.best = true
  return rows
}

/** How long done tasks took, in groups. 1 day = done on the planned day (or before it). */
const TOOK_GROUPS = [
  { name: '1 day', min: 1, max: 1 },
  { name: '2 days', min: 2, max: 2 },
  { name: '3–4 days', min: 3, max: 4 },
  { name: '5+ days', min: 5, max: Infinity },
]

/** A done task that took more than 1 day. */
export interface LongTask {
  text: string
  days: number
  /** The day it was first planned for, and the day it was done. */
  start: string
  end: string
}

export interface MonthRow {
  month: string
  counts: Counts
  rate: number | null
}

/** Each shared month: its tasks and its done rate (for "Month by month"). */
export function monthRows(all: SharedTask[], months: string[], today: string): MonthRow[] {
  return months.map((month) => {
    const counts = countTasks(all.filter((t) => t.day.startsWith(month)), today)
    return { month, counts, rate: doneRate(counts) }
  })
}

export interface TaskStats {
  counts: Counts
  rate: number | null
  /** Done tasks that were done on their planned day (or before it). */
  onTime: number
  /** Done tasks that took more than 1 day, and how many days they took on average. */
  longer: number
  longerAverage: number | null
  /** The most days in a row with at least one task done. */
  streak: { days: number; first: string; last: string } | null
  /** The day with the most tasks done. */
  busiest: { day: string; done: number } | null
  /** The bars of the "each day" chart: each day, or each 7 days / each month for long links. */
  size: GroupSize
  groups: DayGroup[]
  /** Each 7 days, for "done rate, week by week". */
  weeks: DayGroup[]
  weekdays: WeekdayRow[]
  took: { name: string; count: number }[]
  /** The done tasks that took the longest (5 at most, longest first). */
  longest: LongTask[]
}

/**
 * All the numbers for the months `from` to `to` (like "2026-10" and "2026-11").
 * `all` = every task of the share link: a task done in these months can be planned before them.
 */
export function taskStats(all: SharedTask[], from: string, to: string, today: string): TaskStats {
  const first = `${from}-01`
  const last = lastDayOf(to)
  const list = all.filter((t) => t.day >= first && t.day <= last)
  const counts = countTasks(list, today)

  // How long the done tasks took (1 = done on the planned day)
  const took = list
    .filter((t) => t.done)
    .map((t) => ({ t, days: tookDays(t) ?? 1 }))
  const longerTasks = took.filter((x) => x.days > 1)

  // How many tasks were done on each day of these months
  const doneOn = new Map<string, number>()
  for (const t of all) {
    const day = t.done ? doneDayOf(t) : null
    if (day && day >= first && day <= last) doneOn.set(day, (doneOn.get(day) ?? 0) + 1)
  }
  const doneDays = [...doneOn.keys()].sort()

  let streak: TaskStats['streak'] = null
  let runStart = ''
  for (let i = 0; i < doneDays.length; i++) {
    const day = doneDays[i]!
    if (i === 0 || addDays(doneDays[i - 1]!, 1) !== day) runStart = day
    const days = daysBetween(runStart, day) + 1
    if (!streak || days > streak.days) streak = { days, first: runStart, last: day }
  }

  let busiest: TaskStats['busiest'] = null
  for (const day of doneDays) {
    const done = doneOn.get(day)!
    // When two days are the same, the later one
    if (!busiest || done >= busiest.done) busiest = { day, done }
  }

  // Long links: 7 days per bar (or a month per bar) so the bars don't get too thin
  const span = daysBetween(first, last) + 1
  const size: GroupSize = span <= 62 ? 'day' : span <= 7 * 60 ? 'week' : 'month'

  return {
    counts,
    rate: doneRate(counts),
    onTime: took.length - longerTasks.length,
    longer: longerTasks.length,
    longerAverage: longerTasks.length ? longerTasks.reduce((sum, x) => sum + x.days, 0) / longerTasks.length : null,
    streak,
    busiest,
    size,
    groups: groupDays(list, first, last, size, today),
    weeks: groupDays(list, first, last, 'week', today),
    weekdays: weekdayRows(list, today),
    took: TOOK_GROUPS.map((g) => ({ name: g.name, count: took.filter((x) => x.days >= g.min && x.days <= g.max).length })),
    longest: longerTasks
      .map(({ t, days }) => ({ text: t.text, days, start: t.movedFrom ?? t.day, end: doneDayOf(t)! }))
      .sort((a, b) => b.days - a.days || (a.end < b.end ? 1 : a.end > b.end ? -1 : 0))
      .slice(0, 5),
  }
}
