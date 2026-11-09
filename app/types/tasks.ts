export interface Task {
  id: string
  text: string
  /** The day it is planned for, like 2026-11-09. */
  day: string
  done: boolean
  doneAt: string | null
  /** If it was moved: the first day it was planned for. */
  movedFrom: string | null
  createdAt: string
}
