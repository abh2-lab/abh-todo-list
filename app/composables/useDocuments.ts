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

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  async function loadDocs() {
    docs.value = await $fetch<DocMeta[]>('/api/documents')
  }

  async function loadDoc(id: string) {
    const doc = await $fetch<FullDoc>(`/api/documents/${id}`)
    activeDoc.value = doc
    editorContent.value = (doc.content as Record<string, any>) ?? {}
    saveStatus.value = 'saved'
  }

  async function newDoc() {
    const doc = await $fetch<FullDoc>('/api/documents', { method: 'POST' })
    docs.value.unshift(doc)
    await loadDoc(doc.id)
  }

  async function deleteDoc(id: string) {
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
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      saveStatus.value = 'saving'
      try {
        await $fetch(`/api/documents/${activeDoc.value!.id}`, {
          method: 'PUT',
          body: { content },
        })
        saveStatus.value = 'saved'
        const idx = docs.value.findIndex((d) => d.id === activeDoc.value!.id)
        if (idx >= 0) docs.value[idx]!.updatedAt = new Date().toISOString()
      } catch {
        saveStatus.value = 'unsaved'
      }
    }, 1000)
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

  onMounted(async () => {
    await loadDocs()
    if (docs.value.length > 0) {
      await loadDoc(docs.value[0]!.id)
    } else {
      await newDoc()
    }
  })

  onBeforeUnmount(() => {
    if (saveTimer) clearTimeout(saveTimer)
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
