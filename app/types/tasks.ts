export interface Task {
  id: string
  text: string
  /** The day it is planned for, like 2026-11-09. */
  day: string
  done: boolean
  doneAt: string | null
  /** If it was moved: the first day it was planned for. */
  movedFrom: string | null
  /** The note the task line is in (made with the "Today's task" button). */
  docId: string | null
  createdAt: string
}
