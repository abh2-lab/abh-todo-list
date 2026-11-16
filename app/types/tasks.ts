export interface Task {
  id: string
  text: string
  /** The day it is planned for, like 2026-11-09. */
  day: string
  done: boolean
  doneAt: string | null
  /** The day it was done, like 2026-11-12. Empty for tasks done before this was saved (then use doneAt). */
  doneDay: string | null
  /** The person decided not to do it (never pending, never done). */
  cancelled: boolean
  /** If it was moved: the first day it was planned for. */
  movedFrom: string | null
  /** The note the task line is in (made with the "Today's task" button). */
  docId: string | null
  createdAt: string
}

/** A view-only link to someone's Daily tasks of some months. */
export interface TaskShare {
  id: string
  /** First and last month shown, like "2026-09" and "2026-12". */
  from: string
  to: string
  createdAt: string
}

/** What the share page gets: only the task text, its day, done or cancelled, and the day it was done. */
export interface SharedTasks {
  /** First name of the owner (null if we don't know it). */
  name: string | null
  from: string
  to: string
  tasks: SharedTask[]
}

export interface SharedTask {
  text: string
  day: string
  done: boolean
  cancelled: boolean
  movedFrom: string | null
  /** The day it was done (only for done tasks). */
  doneDay: string | null
}
