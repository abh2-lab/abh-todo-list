// Who is editing which note right now, so the app can warn people before two of them
// edit the same note (one of them could lose changes).
// "Editing" = this tab saved a change to the note in the last 2 minutes.
// Every open tab has its own random id, so the same person in two tabs counts as two.
// Kept in the server's memory only: it starts over when the server restarts.

const ACTIVE_MS = 2 * 60 * 1000
const MAX_TABS_PER_NOTE = 20

interface EditorInfo {
  userId: string | null
  /** First name of a logged-in person. null = not logged in (shown as "Someone"). */
  name: string | null
  at: number
}

/** What the browser gets about another editor. `you` = you, in another tab or on another device. */
export interface OtherEditor {
  name: string | null
  you: boolean
}

// note id → tab id → who
const notes = new Map<string, Map<string, EditorInfo>>()
let lastSweep = Date.now()

/** Forget editors who stopped a while ago, so the list doesn't keep growing. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return
  lastSweep = now
  for (const [docId, tabs] of notes) {
    for (const [tab, e] of tabs) if (e.at <= now - ACTIVE_MS) tabs.delete(tab)
    if (tabs.size === 0) notes.delete(docId)
  }
}

const TAB_RE = /^[\w-]{8,64}$/

/** The tab id the browser sent, or null if it is missing or looks wrong. */
export function readTab(value: unknown): string | null {
  return typeof value === 'string' && TAB_RE.test(value) ? value : null
}

export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0]
  return first ? first.slice(0, 40) : null
}

/** This tab just saved a change to the note. */
export function markEditing(docId: string, tab: string, user: { id: string; name?: string } | null | undefined) {
  const now = Date.now()
  sweep(now)
  let tabs = notes.get(docId)
  if (!tabs) notes.set(docId, (tabs = new Map()))
  tabs.delete(tab) // so it moves to the end (the newest)
  tabs.set(tab, { userId: user?.id ?? null, name: firstName(user?.name), at: now })
  // Too many tabs on one note: forget the ones that saved longest ago.
  for (const old of tabs.keys()) {
    if (tabs.size <= MAX_TABS_PER_NOTE) break
    tabs.delete(old)
  }
}

/** This tab is not editing the note any more (it opened another note, or was closed). */
export function stopEditing(docId: string, tab: string) {
  const tabs = notes.get(docId)
  if (!tabs) return
  tabs.delete(tab)
  if (tabs.size === 0) notes.delete(docId)
}

/** Everyone else who saved a change to the note in the last 2 minutes, newest first. */
export function otherEditors(docId: string, tab: string | null, userId: string | undefined): OtherEditor[] {
  const tabs = notes.get(docId)
  if (!tabs) return []
  const since = Date.now() - ACTIVE_MS
  return [...tabs.entries()]
    .filter(([t, e]) => t !== tab && e.at > since)
    .sort((a, b) => b[1].at - a[1].at)
    .map(([, e]) => ({ name: e.name, you: !!userId && e.userId === userId }))
}
