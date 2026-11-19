export interface DocMeta {
  id: string
  title: string
  updatedAt: string
  createdAt: string
  /** true = private note, only the owner sees it. false = public note. */
  isPrivate: boolean
  /** Private note with its view-only link turned on. */
  shared: boolean
}

export interface FullDoc extends DocMeta {
  content: Record<string, any>
}

/** A note in the Trash. Public ones: everyone sees them. Private ones: only their owner. */
export interface TrashedDoc {
  id: string
  title: string
  updatedAt: string
  isPrivate: boolean
  /** When it was moved to the Trash. */
  deletedAt: string
  /** When it is deleted for good (30 days later). */
  purgeAt: string
}

/** A note in the Trash with its text, to read it (view only). */
export interface FullTrashedDoc extends TrashedDoc {
  content: Record<string, any>
}

/** The two parts of the app, switched from the header. */
export type AppView = 'notes' | 'tasks'

/** Someone else who is editing the open note (saved a change in the last 2 minutes). */
export interface OtherEditor {
  /** First name of a logged-in person; null = not logged in ("Someone"). */
  name: string | null
  /** You, in another tab or on another device. */
  you: boolean
}

/**
 * Why the open note is locked for now:
 * 'opened' = you opened a note someone else is editing, 'started' = someone started editing
 * the note you have open (both: we ask first), 'reading' = you chose "Just read".
 */
export type EditHold = 'opened' | 'started' | 'reading' | null

/** Someone else saved the note after you got it, and your changes are not saved yet. */
export interface SaveConflict {
  docId: string
  title: string
  by: OtherEditor | null
}
