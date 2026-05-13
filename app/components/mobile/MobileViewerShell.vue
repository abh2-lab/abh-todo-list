<script setup lang="ts">
import type { TocHeading } from '~/types/editor'
import EditorRootComp from '~/components/editor/EditorRoot.vue'

interface FullDoc {
  id: string
  title: string
  content: Record<string, any>
  updatedAt: string
}

const props = defineProps<{
  doc: FullDoc | null
  tocHeadings: TocHeading[]
  error: boolean
}>()

const emit = defineEmits<{
  'update-toc': [headings: TocHeading[]]
}>()

const editorRef = ref<InstanceType<typeof EditorRootComp> | null>(null)
const setEditorRef = (el: any) => { editorRef.value = el }

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

onBeforeUnmount(() => {
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
})

function jumpToHeading(pos: number) {
  editorRef.value?.scrollToPos(pos)
}
</script>

<template>
  <div class="mobile-shell relative h-screen overflow-hidden bg-black">
    <!-- Compact viewer header -->
    <header
      class="fixed top-0 left-0 right-0 z-30 flex items-center gap-2 px-3 h-11 border-b border-[#1f1f1f] bg-black transition-transform duration-200 ease-out"
      :class="headerHidden ? '-translate-y-full' : 'translate-y-0'"
    >
      <NuxtLink
        to="/"
        class="flex items-center justify-center w-8 h-8 rounded text-[#999] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors shrink-0"
        title="All Notes"
      >
        <svg width="14" height="14" viewBox="0 0 10 10" fill="none">
          <path d="M6.5 1.5L3 5l3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </NuxtLink>

      <span class="text-sm text-[#c0c0c0] truncate flex-1 min-w-0">
        {{ doc?.title || 'Untitled' }}
      </span>

      <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#6366f1] border border-[#6366f1]/30 font-medium shrink-0">
        View
      </span>
    </header>

    <!-- Error state -->
    <div
      v-if="error"
      class="absolute left-0 right-0 bottom-0 top-11 flex flex-col items-center justify-center gap-3 text-center px-6"
    >
      <div class="text-4xl text-[#1f1f1f]">404</div>
      <div class="text-[#444] text-sm">Document not found or has been deleted.</div>
      <NuxtLink to="/" class="text-[#6366f1] text-sm hover:underline">Go back to notes</NuxtLink>
    </div>

    <!-- Loading -->
    <div
      v-else-if="!doc"
      class="absolute left-0 right-0 bottom-0 top-11 flex items-center justify-center text-[#2a2a2a] text-sm select-none"
    >
      Loading…
    </div>

    <!-- Body -->
    <div
      v-else
      class="absolute left-0 right-0 bottom-0 flex flex-col transition-[top] duration-200 ease-out min-w-0"
      :class="headerHidden ? 'top-0' : 'top-11'"
    >
      <EditorRoot
        :ref="setEditorRef"
        :model-value="doc.content"
        doc-id="view"
        :editable="false"
        @update:toc-headings="emit('update-toc', $event)"
      />
    </div>

    <!-- Floating TOC button + drawer -->
    <MobileFloatingTocButton
      v-if="doc && tocHeadings.length && !tocOpen"
      @click="tocOpen = true"
    />
    <MobileTocDrawer
      :headings="tocHeadings"
      :open="tocOpen"
      @close="tocOpen = false"
      @jump="jumpToHeading"
    />
  </div>
</template>
