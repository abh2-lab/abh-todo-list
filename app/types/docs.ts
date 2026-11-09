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

/** The two parts of the app, switched from the header. */
export type AppView = 'notes' | 'tasks'
