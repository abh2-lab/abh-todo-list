<script setup lang="ts">
import { ExternalLinkIcon, LockIcon, XIcon } from '@lucide/vue'
import type { FullDoc } from '~/types/docs'

// The reading panel on the right of a board: a note, view only.
// "Open note" goes to the note itself, to change it.
const props = defineProps<{ docId: string }>()
const emit = defineEmits<{ close: [] }>()

const doc = ref<FullDoc | null>(null)
const failed = ref(false)

async function load(id: string) {
  doc.value = null
  failed.value = false
  try {
    doc.value = await $fetch<FullDoc>(`/api/documents/${id}`)
  } catch {
    failed.value = true
  }
}

watch(() => props.docId, (id) => void load(id), { immediate: true })
</script>

<template>
  <aside class="board-reader flex flex-col min-h-0 bg-[#050505] border-l border-[#1f1f1f]" aria-label="Reading a note">
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-[#161616] shrink-0">
      <LockIcon v-if="doc?.isPrivate" :size="14" class="text-[#6366f1] shrink-0" />
      <h3 class="flex-1 min-w-0 text-sm font-medium text-[#f0f0f0] truncate" :title="doc?.title">
        {{ doc ? doc.title || 'Untitled' : 'Loading…' }}
      </h3>
      <NuxtLink :to="`/note/${encodeURIComponent(docId)}`" class="btn btn-accent btn-sm shrink-0" title="Open the note to change it">
        <ExternalLinkIcon :size="14" />
        Open note
      </NuxtLink>
      <button class="btn btn-ghost btn-sm shrink-0" title="Close" @click="emit('close')">
        <XIcon :size="15" />
      </button>
    </div>

    <p v-if="failed" class="p-4 text-sm text-[#fca5a5]">This note can't be opened. It may have been moved to the Trash.</p>
    <div v-else-if="doc" class="flex flex-col flex-1 min-h-0">
      <EditorRoot
        :key="doc.id"
        :model-value="doc.content"
        :doc-id="`board:${doc.id}`"
        :editable="false"
      />
    </div>
  </aside>
</template>
