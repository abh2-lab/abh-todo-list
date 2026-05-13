<script setup lang="ts">
import type { TocHeading } from '~/types/editor'
import EditorRootComp from '~/components/editor/EditorRoot.vue'

interface DocMeta {
  id: string
  title: string
  updatedAt: string
  createdAt: string
}

interface FullDoc extends DocMeta {
  content: Record<string, any>
}

const props = defineProps<{
  docs: DocMeta[]
  activeDoc: FullDoc | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  editorContent: Record<string, any>
  tocHeadings: TocHeading[]
}>()

const emit = defineEmits<{
  'select-doc': [id: string]
  'delete-doc': [id: string]
  'new-doc': []
  'update-title': [title: string]
  'update-content': [content: Record<string, any>]
  'update-toc': [headings: TocHeading[]]
  'update-save-status': [status: 'saved' | 'saving' | 'unsaved']
}>()

const editorRef = ref<InstanceType<typeof EditorRootComp> | null>(null)
const setEditorRef = (el: any) => { editorRef.value = el }

const sidebarOpen = ref(false)
const viewMode = ref(false)
const tocOpen = ref(false)
const headerHidden = ref(false)

let lastScrollTop = 0
let scrollEl: HTMLElement | null = null

function onScroll() {
  if (!scrollEl) return
  const top = scrollEl.scrollTop
  if (top < 20) {
    headerHidden.value = false
  } else if (top > lastScrollTop + 5) {
    headerHidden.value = true
  } else if (top < lastScrollTop - 5) {
    headerHidden.value = false
  }
  lastScrollTop = top
}

function attachScroll() {
  const el = (editorRef.value as any)?.scroller as HTMLElement | undefined
  if (!el || el === scrollEl) return
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
  scrollEl = el
  scrollEl.addEventListener('scroll', onScroll, { passive: true })
  lastScrollTop = scrollEl.scrollTop
}

watch(editorRef, () => {
  nextTick(attachScroll)
})

watch(() => props.activeDoc?.id, () => {
  // Reset scroll tracking on doc switch
  nextTick(() => {
    if (scrollEl) lastScrollTop = scrollEl.scrollTop
    headerHidden.value = false
  })
})

onBeforeUnmount(() => {
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
})

function jumpToHeading(pos: number) {
  editorRef.value?.scrollToPos(pos)
}

function handleSidebarSelect(id: string) {
  emit('select-doc', id)
  sidebarOpen.value = false
}

function handleNewFromSidebar() {
  emit('new-doc')
  sidebarOpen.value = false
}
</script>

<template>
  <div class="mobile-shell relative h-screen overflow-hidden bg-black">
    <MobileHeader
      :title="activeDoc?.title ?? 'Untitled'"
      :save-status="saveStatus"
      :sidebar-open="sidebarOpen"
      :view-mode="viewMode"
      :doc-id="activeDoc?.id ?? null"
      :hidden="headerHidden"
      @update:title="emit('update-title', $event)"
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
      @toggle-view-mode="viewMode = !viewMode"
      @new-doc="emit('new-doc')"
    />

    <!-- Body — slides up when header hides so editor fills viewport -->
    <div
      class="absolute left-0 right-0 bottom-0 flex flex-col transition-[top] duration-200 ease-out min-w-0"
      :class="headerHidden ? 'top-0' : 'top-12'"
    >
      <EditorToolbar
        v-if="!viewMode"
        :editor="editorRef?.editor ?? null"
      />

      <EditorRoot
        v-if="activeDoc"
        :ref="setEditorRef"
        :model-value="editorContent"
        :doc-id="activeDoc.id"
        :editable="!viewMode"
        @update:model-value="emit('update-content', $event)"
        @update:toc-headings="emit('update-toc', $event)"
        @save-status="emit('update-save-status', $event)"
      />
      <div v-else class="flex-1 flex items-center justify-center text-[#2a2a2a] text-sm select-none">
        Loading…
      </div>
    </div>

    <!-- Sidebar backdrop + drawer -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="absolute inset-0 z-30 bg-black/50"
        @click="sidebarOpen = false"
      />
    </Transition>
    <Transition name="slide-left">
      <DocSidebar
        v-if="sidebarOpen"
        class="absolute left-0 top-0 bottom-0 z-40"
        :docs="docs"
        :active-id="activeDoc?.id ?? null"
        @select="handleSidebarSelect"
        @delete="emit('delete-doc', $event)"
        @new-doc="handleNewFromSidebar"
        @close="sidebarOpen = false"
      />
    </Transition>

    <!-- Floating TOC button (hidden when something is overlaying) -->
    <MobileFloatingTocButton
      v-if="tocHeadings.length && !sidebarOpen && !tocOpen"
      @click="tocOpen = true"
    />

    <!-- TOC drawer -->
    <MobileTocDrawer
      :headings="tocHeadings"
      :open="tocOpen"
      @close="tocOpen = false"
      @jump="jumpToHeading"
    />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); }
</style>
