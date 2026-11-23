import { notePreview } from '#shared/noteText'
import type { DocMeta, FullDoc } from '~/types/docs'
import type { GroupNote } from '~/types/groups'

// The notes of a group, for its boards: their names and first words (for the cards), and which
// notes are in the group. On a board, the note cards decide that: taking a note card off takes
// the note out of the group (the note itself stays), and Undo puts it back in.
// Notes in the Trash stay in the group: their cards are hidden until the note is back.
export function useBoardNotes(groupId: string, tell: TellFn) {
  const { setInGroup } = useGroups()
  /** The notes in the group (name, first words), by note id. */
  const notes = ref(new Map<string, GroupNote>())
  /** The notes in the group, as the server has them (with the ones in the Trash). */
  const members = new Set<string>()

  /** The notes, as loaded with the group. */
  function setNotes(list: GroupNote[]) {
    notes.value = new Map(list.map((n) => [n.id, n]))
    members.clear()
    for (const n of list) members.add(n.id)
  }

  /** A note in the Trash: its card is not shown (but kept). */
  function inTrash(docId: string | undefined): boolean {
    return !!docId && !!notes.value.get(docId)?.inTrash
  }

  /**
   * Make the group's notes the same as the note cards on the board (onBoard() gives their
   * notes): after taking note cards off, and after undo or redo. One change after the other.
   */
  let syncing: Promise<void> = Promise.resolve()
  function syncMembers(onBoard: () => Iterable<string>) {
    syncing = syncing.then(async () => {
      const want = new Set(onBoard())
      for (const [id, n] of notes.value) if (n.inTrash && members.has(id)) want.add(id)
      for (const id of want) {
        if (members.has(id)) continue
        members.add(id)
        try {
          await setInGroup(groupId, id, true)
        } catch (e) {
          members.delete(id)
          tell(errorMessage(e) ?? 'Could not put a note back in the group. Check your connection.', { error: true })
        }
      }
      for (const id of [...members]) {
        if (want.has(id)) continue
        members.delete(id)
        try {
          await setInGroup(groupId, id, false)
        } catch {
          members.add(id)
          tell('Could not take a note out of the group. Check your connection.', { error: true })
        }
      }
    })
    return syncing
  }

  /** Put a note in the group (picked in "Add a note"). false = it is in already, or it did not work (it says why). */
  async function addNote(doc: DocMeta): Promise<boolean> {
    if (members.has(doc.id)) return false
    members.add(doc.id)
    try {
      await setInGroup(groupId, doc.id, true)
    } catch (e) {
      members.delete(doc.id)
      tell(errorMessage(e) ?? 'Could not add the note. Check your connection and try again.', { error: true })
      return false
    }
    notes.value.set(doc.id, { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, isPrivate: doc.isPrivate, inTrash: false, preview: '' })
    void loadPreview(doc.id)
    return true
  }

  /** The first words of a note just added, for its card. */
  async function loadPreview(docId: string) {
    try {
      const full = await $fetch<FullDoc>(`/api/documents/${encodeURIComponent(docId)}`)
      const note = notes.value.get(docId)
      if (note) note.preview = notePreview(full.content)
    } catch {
      // The card shows only the name.
    }
  }

  /** A new private note ("New note" in "Add a note"), or null when it could not be made (it says why). */
  async function newNote(title: string): Promise<DocMeta | null> {
    try {
      return await $fetch<DocMeta>('/api/documents', { method: 'POST', body: { private: true, title } })
    } catch (e) {
      tell(errorMessage(e) ?? 'Could not make the note. Check your connection and try again.', { error: true })
      return null
    }
  }

  return { notes, members, setNotes, inTrash, syncMembers, addNote, newNote }
}
