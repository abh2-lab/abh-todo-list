<script setup lang="ts">
import type { TocHeading } from '~/types/editor'

const route = useRoute()
const id = route.params.id as string

interface FullDoc {
  id: string
  title: string
  content: Record<string, any>
  updatedAt: string
}

const doc = ref<FullDoc | null>(null)
const error = ref(false)
const tocHeadings = ref<TocHeading[]>([])
const editorRef = ref<any>(null)

useHead(() => ({ title: doc.value ? `${doc.value.title} — Notes` : 'Notes' }))

onMounted(async () => {
  try {
    doc.value = await $fetch<FullDoc>(`/api/documents/${id}`)
  } catch {
    error.value = true
  }
})

function jumpToHeading(pos: number) {
  editorRef.value?.scrollToPos(pos)
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
</script>

<template>
  <div class="flex flex-col h-screen bg-black overflow-hidden">
    <!-- View header -->
    <header class="flex items-center justify-between px-5 h-11 border-b border-[#1f1f1f] bg-black shrink-0">
      <div class="flex items-center gap-3">
        <NuxtLink
          to="/"
          class="flex items-center gap-1.5 text-[11px] text-[#555] hover:text-[#999] transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M6.5 1.5L3 5l3.5 3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          All Notes
        </NuxtLink>

        <span class="text-[#1f1f1f]">/</span>

        <span class="text-sm text-[#888] truncate max-w-xs">{{ doc?.title || 'Untitled' }}</span>

        <span class="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#6366f1] border border-[#6366f1]/30 font-medium">
          View only
        </span>
      </div>

      <span v-if="doc" class="text-[11px] text-[#333]">
        Last edited {{ formatDate(doc.updatedAt) }}
      </span>
    </header>

    <!-- Error state -->
    <div v-if="error" class="flex-1 flex flex-col items-center justify-center gap-3 text-center">
      <div class="text-4xl text-[#1f1f1f]">404</div>
      <div class="text-[#444] text-sm">Document not found or has been deleted.</div>
      <NuxtLink to="/" class="text-[#6366f1] text-sm hover:underline">Go back to notes</NuxtLink>
    </div>

    <!-- Loading -->
    <div v-else-if="!doc" class="flex-1 flex items-center justify-center text-[#2a2a2a] text-sm select-none">
      Loading…
    </div>

    <!-- Content -->
    <div v-else class="flex flex-1 min-h-0 overflow-hidden">
      <!-- Editor in read-only mode -->
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <EditorRoot
          ref="editorRef"
          :model-value="doc.content"
          doc-id="view"
          :editable="false"
          @update:toc-headings="tocHeadings = $event"
        />
      </div>

      <!-- TOC sidebar -->
      <TableOfContents :headings="tocHeadings" @jump="jumpToHeading" />
    </div>
  </div>
</template>
