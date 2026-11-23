<script setup lang="ts">
import { CheckIcon, FileTextIcon, LockIcon, PlusIcon, SearchIcon, XIcon } from '@lucide/vue'
import type { DocMeta } from '~/types/docs'

// "Add a note" on a board: pick one of your notes (or a public note), or make a new one.
// Notes that are already on the board can't be picked again.
const props = defineProps<{
  /** Notes already in the group. */
  inGroup: string[]
}>()

const emit = defineEmits<{
  pick: [doc: DocMeta]
  create: [title: string]
  close: []
}>()

const docs = ref<DocMeta[] | null>(null)
const failed = ref(false)
const search = ref('')
const newTitle = ref('')
const searchInput = ref<HTMLInputElement | null>(null)

onMounted(async () => {
  nextTick(() => searchInput.value?.focus())
  try {
    docs.value = await $fetch<DocMeta[]>('/api/documents')
  } catch {
    failed.value = true
  }
})

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = docs.value ?? []
  return q ? list.filter((d) => (d.title || 'Untitled').toLowerCase().includes(q)) : list
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

function create() {
  const title = newTitle.value.trim()
  if (title) emit('create', title)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[9990] bg-black/70 flex items-start justify-center p-4 pt-[12vh]"
      @click.self="emit('close')"
      @keydown="onKey"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-picker-title"
        class="w-full max-w-lg max-h-[75vh] flex flex-col rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black"
      >
        <div class="flex items-center gap-2 px-4 pt-4 pb-3 shrink-0">
          <h3 id="note-picker-title" class="flex-1 text-sm font-medium text-[#f0f0f0]">Add a note to the board</h3>
          <button class="btn btn-ghost btn-sm" title="Close" @click="emit('close')">
            <XIcon :size="15" />
          </button>
        </div>

        <!-- New note -->
        <form class="flex gap-2 px-4 pb-3 shrink-0" @submit.prevent="create">
          <input
            v-model="newTitle"
            maxlength="200"
            placeholder="Name of a new note…"
            class="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1f1f1f] focus:border-[#6366f1]/50 rounded px-2.5 py-1.5 text-sm text-[#f0f0f0] outline-none placeholder:text-[#444]"
          >
          <button class="btn btn-accent btn-sm" type="submit" :disabled="!newTitle.trim()">
            <PlusIcon :size="14" />
            New note
          </button>
        </form>

        <!-- Search -->
        <div class="mx-4 mb-2 flex items-center gap-2 border-t border-[#161616] pt-3 shrink-0">
          <SearchIcon :size="15" class="text-[#555] shrink-0" />
          <input
            ref="searchInput"
            v-model="search"
            placeholder="Find one of your notes…"
            class="flex-1 min-w-0 bg-transparent text-sm text-[#f0f0f0] outline-none placeholder:text-[#444]"
          >
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
          <p v-if="failed" class="px-2 py-3 text-xs text-[#fca5a5]">Could not load your notes. Check your connection and try again.</p>
          <p v-else-if="!docs" class="px-2 py-3 text-xs text-[#555]">Loading…</p>
          <p v-else-if="shown.length === 0" class="px-2 py-3 text-xs text-[#555]">No notes found.</p>
          <button
            v-for="d in shown"
            :key="d.id"
            class="w-full flex items-center gap-2.5 px-2 py-2 rounded text-left transition-colors"
            :class="props.inGroup.includes(d.id) ? 'opacity-50 cursor-default' : 'hover:bg-[#141414]'"
            :disabled="props.inGroup.includes(d.id)"
            :title="props.inGroup.includes(d.id) ? 'Already on this board' : `Add ${d.title || 'Untitled'}`"
            @click="emit('pick', d)"
          >
            <LockIcon v-if="d.isPrivate" :size="14" class="shrink-0 text-[#555]" />
            <FileTextIcon v-else :size="14" class="shrink-0 text-[#555]" />
            <span class="flex-1 min-w-0 truncate text-sm text-[#ccc]">{{ d.title || 'Untitled' }}</span>
            <span v-if="props.inGroup.includes(d.id)" class="flex items-center gap-1 text-2xs text-[#6366f1] shrink-0">
              <CheckIcon :size="12" />
              On the board
            </span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
