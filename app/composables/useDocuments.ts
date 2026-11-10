import type { TocHeading } from '~/types/editor'
import type { DocMeta, FullDoc } from '~/types/docs'
import type EditorRootComp from '~/components/editor/EditorRoot.vue'

export function useDocuments(opts: { initialDocId?: string | null } = {}) {
  const { loggedIn } = useUserSession()
  const { tasksChanged } = usePendingTasks()
  const docs = ref<DocMeta[]>([])
  const activeDoc = ref<FullDoc | null>(null)
  const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')
  const editorContent = ref<Record<string, any>>({})
  const tocHeadings = ref<TocHeading[]>([])
  const editorRef = ref<InstanceType<typeof EditorRootComp> | null>(null)

  // Auto-save runs 1s after the last change. We keep the note id together
  // with the content, so a save that runs after the user switched notes
  // still goes to the note that was edited (not the one open now).
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSave: { id: string; content: Record<string, any> } | null = null

  async function saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (!pendingSave) return
    const { id, content } = pendingSave
    pendingSave = null
    const isOpen = () => activeDoc.value?.id === id
    if (isOpen()) saveStatus.value = 'saving'
    try {
      const res = await $fetch<{ tasksChanged?: boolean }>(`/api/documents/${id}`, {
        method: 'PUT',
        body: { content },
      })
      if (isOpen()) saveStatus.value = 'saved'
      const meta = docs.value.find((d) => d.id === id)
      if (meta) meta.updatedAt = new Date().toISOString()
      // A task line's text changed, or a task line was deleted: the task list changed too.
      if (res?.tasksChanged) void tasksChanged()
    } catch {
      if (isOpen()) saveStatus.value = 'unsaved'
    }
  }

  async function loadDocs() {
    docs.value = await $fetch<DocMeta[]>('/api/documents')
  }

  async function loadDoc(id: string) {
    await saveNow() // finish saving the open note before switching
    const doc = await $fetch<FullDoc>(`/api/documents/${id}`)
    activeDoc.value = doc
    editorContent.value = (doc.content as Record<string, any>) ?? {}
    saveStatus.value = 'saved'
  }

  /**
   * New note. Logged in: private by default, named with today's date ("9 Nov 2026, Monday").
   * If you already have a note with that name, the server names it "9 Nov 2026, Monday_2" (then _3, …).
   * Logged out: always public.
   */
  async function newDoc(opts: { private?: boolean } = {}) {
    await saveNow()
    const makePrivate = loggedIn.value && (opts.private ?? true)
    const doc = await $fetch<FullDoc>('/api/documents', {
      method: 'POST',
      body: { private: makePrivate, title: makePrivate ? noteDateTitle() : undefined },
    })
    docs.value.unshift(doc)
    await loadDoc(doc.id)
  }

  /** Turn the view-only link of the open private note on or off. */
  async function setShared(on: boolean) {
    const id = activeDoc.value?.id
    if (!id) return
    const show = (value: boolean) => {
      if (activeDoc.value?.id === id) activeDoc.value.shared = value
      const meta = docs.value.find((d) => d.id === id)
      if (meta) meta.shared = value
    }
    // Show the change right away; put it back if the server says no.
    show(on)
    try {
      await $fetch(`/api/documents/${id}`, { method: 'PUT', body: { shared: on } })
    } catch (e) {
      show(!on)
      console.error('Could not change sharing:', e)
    }
  }

  async function deleteDoc(id: string) {
    // No need to save changes of a note that is being deleted.
    if (pendingSave?.id === id) {
      pendingSave = null
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
    }
    await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
    docs.value = docs.value.filter((d) => d.id !== id)
    if (activeDoc.value?.id === id) {
      activeDoc.value = null
      editorContent.value = {}
      if (docs.value.length > 0) await loadDoc(docs.value[0]!.id)
    }
  }

  function onContentUpdate(content: Record<string, any>) {
    editorContent.value = content
    if (!activeDoc.value) return
    // Changes of another note still waiting? Save them first.
    if (pendingSave && pendingSave.id !== activeDoc.value.id) void saveNow()
    pendingSave = { id: activeDoc.value.id, content }
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveNow, 1000)
  }

  async function updateTitle(title: string) {
    if (!activeDoc.value) return
    activeDoc.value.title = title
    const idx = docs.value.findIndex((d) => d.id === activeDoc.value!.id)
    if (idx >= 0) docs.value[idx]!.title = title
    await $fetch(`/api/documents/${activeDoc.value.id}`, {
      method: 'PUT',
      body: { title },
    })
  }

  function jumpToHeading(pos: number) {
    editorRef.value?.scrollToPos(pos)
  }

  // Save right away when the page is hidden (other tab, other app, closing).
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') void saveNow()
  }

  onMounted(async () => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    await loadDocs()
    // A link from the task list ("Open note") opens that note, if it is in your list.
    const linked = opts.initialDocId ? docs.value.find((d) => d.id === opts.initialDocId) : undefined
    if (linked) {
      try {
        await loadDoc(linked.id)
        return
      } catch {
        // Could not load it: open the usual note below.
      }
    }
    // Logged in: start with your newest private note.
    const first = (loggedIn.value && docs.value.find((d) => d.isPrivate)) || docs.value[0]
    if (first) {
      await loadDoc(first.id)
    } else {
      await newDoc()
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    void saveNow()
  })

  return {
    docs,
    activeDoc,
    saveStatus,
    editorContent,
    tocHeadings,
    editorRef,
    loadDoc,
    newDoc,
    deleteDoc,
    onContentUpdate,
    updateTitle,
    jumpToHeading,
    setShared,
  }
}
