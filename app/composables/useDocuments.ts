import type { TocHeading } from '~/types/editor'
import type EditorRootComp from '~/components/editor/EditorRoot.vue'

interface DocMeta {
  id: string
  title: string
  updatedAt: string
  createdAt: string
}

interface FullDoc extends DocMeta {
  content: Record<string, any>
}

export function useDocuments() {
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
      await $fetch(`/api/documents/${id}`, {
        method: 'PUT',
        body: { content },
      })
      if (isOpen()) saveStatus.value = 'saved'
      const meta = docs.value.find((d) => d.id === id)
      if (meta) meta.updatedAt = new Date().toISOString()
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

  async function newDoc() {
    await saveNow()
    const doc = await $fetch<FullDoc>('/api/documents', { method: 'POST' })
    docs.value.unshift(doc)
    await loadDoc(doc.id)
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
    if (docs.value.length > 0) {
      await loadDoc(docs.value[0]!.id)
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
  }
}
