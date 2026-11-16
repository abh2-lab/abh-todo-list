// The state of a Daily task, the same everywhere (list, calendar, share page, analytics).

/**
 * done = ticked, cancelled = the person decided not to do it,
 * late = not done and its day is over (pending), todo = not done, today or later.
 */
export type TaskState = 'done' | 'cancelled' | 'late' | 'todo'

export function taskState(t: { done: boolean; cancelled?: boolean; day: string }, today: string): TaskState {
  if (t.done) return 'done'
  if (t.cancelled) return 'cancelled'
  return t.day < today ? 'late' : 'todo'
}

/** "2 of 5 done", and " · 1 cancelled" when some are cancelled. */
export function doneText(list: { done: boolean; cancelled?: boolean }[]): string {
  const done = list.filter((t) => t.done).length
  const cancelled = list.filter((t) => t.cancelled).length
  return `${done} of ${list.length} done${cancelled ? ` · ${cancelled} cancelled` : ''}`
}
