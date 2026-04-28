<script setup lang="ts">
import type { TocHeading } from '~/types/editor'
import EditorRootComp from '~/components/editor/EditorRoot.vue'

useHead({ title: 'Notes' })

interface DocMeta {
  id: string
  title: string
  updatedAt: string
  createdAt: string
}

interface FullDoc extends DocMeta {
  content: Record<string, any>
}

const sidebarOpen = ref(false)
const viewMode = ref(false)
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
  viewMode.value = false
}

async function deleteDoc(id: string) {
  await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
  docs.value = docs.value.filter((d) => d.id !== id)
  if (activeDoc.value?.id === id) {
    activeDoc.value = null
    editorContent.value = {}
    if (docs.value.length > 0) await loadDoc(docs.value[0].id)
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
      if (idx >= 0) docs.value[idx].updatedAt = new Date().toISOString()
    } catch {
      saveStatus.value = 'unsaved'
    }
  }, 1000)
}

async function updateTitle(title: string) {
  if (!activeDoc.value) return
  activeDoc.value.title = title
  const idx = docs.value.findIndex((d) => d.id === activeDoc.value!.id)
  if (idx >= 0) docs.value[idx].title = title
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
    await loadDoc(docs.value[0].id)
  } else {
    await newDoc()
  }
})

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div class="flex flex-col h-screen bg-black overflow-hidden">
    <AppHeader
      :title="activeDoc?.title ?? 'Untitled'"
      :save-status="saveStatus"
      :sidebar-open="sidebarOpen"
      :view-mode="viewMode"
      :doc-id="activeDoc?.id ?? null"
      @update:title="updateTitle"
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
      @toggle-view-mode="viewMode = !viewMode"
      @new-doc="newDoc"
    />

    <!-- Body -->
    <div class="relative flex flex-1 min-h-0 overflow-hidden">

      <!-- Backdrop -->
      <Transition name="fade">
        <div
          v-if="sidebarOpen"
          class="absolute inset-0 z-20 bg-black/50"
          @click="sidebarOpen = false"
        />
      </Transition>

      <!-- Floating sidebar -->
      <Transition name="slide-left">
        <DocSidebar
          v-if="sidebarOpen"
          class="absolute left-0 top-0 bottom-0 z-30"
          :docs="docs"
          :active-id="activeDoc?.id ?? null"
          @select="loadDoc"
          @delete="deleteDoc"
          @new-doc="newDoc"
          @close="sidebarOpen = false"
        />
      </Transition>

      <!-- Editor column -->
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <!-- Toolbar — plain v-if avoids Transition + multi-root warning -->
        <EditorToolbar
          v-if="!viewMode"
          :editor="editorRef?.editor ?? null"
        />

        <EditorRoot
          v-if="activeDoc"
          ref="editorRef"
          :model-value="editorContent"
          :doc-id="activeDoc.id"
          :editable="!viewMode"
          @update:model-value="onContentUpdate"
          @update:toc-headings="tocHeadings = $event"
          @save-status="saveStatus = $event"
        />

        <div v-else class="flex-1 flex items-center justify-center text-[#2a2a2a] text-sm select-none">
          Loading…
        </div>
      </div>

      <!-- TOC sidebar -->
      <TableOfContents :headings="tocHeadings" @jump="jumpToHeading" />
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); }
</style>
