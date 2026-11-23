import type { GroupMeta } from '~/types/groups'

// Groups of notes (like labels; only you see them), for the notes list and the Groups button.
// Each group has a Mind map board: /group/<id>.
export function useGroups() {
  const groups = useState<GroupMeta[]>('note-groups', () => [])
  const loaded = useState('note-groups-loaded', () => false)
  const { loggedIn } = useUserSession()

  function sortByName() {
    groups.value = [...groups.value].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }

  async function loadGroups() {
    if (!loggedIn.value) {
      groups.value = []
      return
    }
    try {
      groups.value = await $fetch<GroupMeta[]>('/api/groups')
      loaded.value = true
    } catch {
      // Keep the old list if the network fails.
    }
  }

  /** Make a group (with this note in it, when docId is given). Returns it, or throws. */
  async function createGroup(name: string, docId?: string): Promise<GroupMeta> {
    const group = await $fetch<GroupMeta>('/api/groups', { method: 'POST', body: { name, docId } })
    groups.value = [...groups.value, group]
    sortByName()
    return group
  }

  async function renameGroup(id: string, name: string) {
    const saved = await $fetch<{ name: string }>(`/api/groups/${id}`, { method: 'PUT', body: { name } })
    const g = groups.value.find((x) => x.id === id)
    if (g) g.name = saved.name
    sortByName()
    return saved.name
  }

  async function deleteGroup(id: string) {
    await $fetch(`/api/groups/${id}`, { method: 'DELETE' })
    groups.value = groups.value.filter((g) => g.id !== id)
  }

  /** Put a note in a group, or take it out. The list shows the change right away. */
  async function setInGroup(groupId: string, docId: string, inGroup: boolean) {
    const g = groups.value.find((x) => x.id === groupId)
    const before = g ? [...g.noteIds] : null
    if (g) g.noteIds = inGroup ? [...new Set([...g.noteIds, docId])] : g.noteIds.filter((id) => id !== docId)
    try {
      if (inGroup) await $fetch(`/api/groups/${groupId}/notes`, { method: 'POST', body: { docId } })
      else await $fetch(`/api/groups/${groupId}/notes/${docId}`, { method: 'DELETE' })
    } catch (e) {
      if (g && before) g.noteIds = before
      throw e
    }
  }

  /** The groups a note is in. */
  function groupsOf(docId: string) {
    return groups.value.filter((g) => g.noteIds.includes(docId))
  }

  return { groups, loaded, loadGroups, createGroup, renameGroup, deleteGroup, setInGroup, groupsOf }
}
