<script setup lang="ts">
import type { AppView } from '~/types/docs'

const props = defineProps<{
  view: AppView
  title: string
  saveStatus: 'saved' | 'saving' | 'unsaved'
  sidebarOpen: boolean
  viewMode: boolean
  docId: string | null
  isPrivate: boolean
  shared: boolean
  pendingCount: number
  hidden?: boolean
}>()

const emit = defineEmits<{
  'update:title': [value: string]
  'toggle-sidebar': []
  'toggle-view-mode': []
  'new-doc': []
  'set-shared': [on: boolean]
}>()

const editingTitle = ref(false)
const titleInput = ref<HTMLInputElement | null>(null)
const localTitle = ref(props.title)

watch(() => props.title, (v) => { localTitle.value = v })

function startEditTitle() {
  if (props.viewMode) return
  editingTitle.value = true
  nextTick(() => titleInput.value?.select())
}

function commitTitle() {
  editingTitle.value = false
  const trimmed = localTitle.value.trim() || 'Untitled'
  localTitle.value = trimmed
  emit('update:title', trimmed)
}

function onTitleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  if (e.key === 'Escape') {
    localTitle.value = props.title
    editingTitle.value = false
  }
}
</script>

<template>
  <header
    class="fixed top-0 left-0 right-0 z-30 flex items-center gap-1.5 px-2 h-12 border-b border-[#1f1f1f] bg-black transition-transform duration-200 ease-out"
    :class="hidden ? '-translate-y-full' : 'translate-y-0'"
  >
    <!-- Sidebar toggle (red dot = you have pending tasks) -->
    <button
      class="relative flex items-center justify-center w-9 h-9 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
      :class="sidebarOpen ? 'text-[#6366f1]' : 'text-[#999]'"
      :title="pendingCount ? `Menu (${pendingCount} pending ${pendingCount === 1 ? 'task' : 'tasks'})` : (sidebarOpen ? 'Hide notes' : 'Show notes')"
      @click="emit('toggle-sidebar')"
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="2.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
        <rect x="1" y="7.25" width="10" height="1.5" rx="0.75" fill="currentColor"/>
        <rect x="1" y="12" width="12" height="1.5" rx="0.75" fill="currentColor"/>
      </svg>
      <span
        v-if="pendingCount > 0"
        class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ef4444] ring-2 ring-black"
      />
    </button>

    <!-- Title -->
    <div v-if="view === 'notes'" class="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
      <span v-if="isPrivate" class="shrink-0 text-[#6366f1]" title="Private note: only you can see it">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="6.25" width="8" height="5.75" rx="1" stroke="currentColor" stroke-width="1.3"/>
          <path d="M4.75 6.25V4.5a2.25 2.25 0 014.5 0v1.75" stroke="currentColor" stroke-width="1.3"/>
        </svg>
      </span>
      <input
        v-if="editingTitle"
        ref="titleInput"
        v-model="localTitle"
        class="bg-transparent text-sm text-[#f0f0f0] outline-none border-b border-[#6366f1] min-w-0 w-full"
        @blur="commitTitle"
        @keydown="onTitleKeydown"
      />
      <button
        v-else
        class="text-sm truncate text-left transition-colors min-w-0"
        :class="viewMode ? 'text-[#888] cursor-default' : 'text-[#c0c0c0]'"
        @click="startEditTitle"
      >
        {{ localTitle }}
      </button>

      <!-- Save status dot -->
      <span
        v-if="saveStatus !== 'saved'"
        class="shrink-0 w-1.5 h-1.5 rounded-full"
        :class="{
          'bg-[#6366f1] animate-pulse': saveStatus === 'saving',
          'bg-[#666]': saveStatus === 'unsaved',
        }"
        :title="saveStatus === 'saving' ? 'Saving…' : 'Unsaved'"
      />
    </div>
    <div v-else class="flex-1 min-w-0 text-sm text-[#c0c0c0] truncate">Daily tasks</div>

    <template v-if="view === 'notes'">
      <!-- View / Edit toggle -->
      <button
        class="flex items-center justify-center w-9 h-9 rounded transition-colors shrink-0"
        :class="viewMode
          ? 'text-[#818cf8] bg-[#6366f1]/10'
          : 'text-[#999] hover:bg-[#1a1a1a]'"
        :title="viewMode ? 'Switch to edit mode' : 'Switch to view mode'"
        @click="emit('toggle-view-mode')"
      >
        <svg v-if="!viewMode" width="14" height="14" viewBox="0 0 12 12" fill="none">
          <circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.2"/>
          <path d="M1 6C2 3.5 3.8 2 6 2s4 1.5 5 4c-1 2.5-2.8 4-5 4s-4-1.5-5-4z" stroke="currentColor" stroke-width="1.2"/>
        </svg>
        <svg v-else width="14" height="14" viewBox="0 0 12 12" fill="none">
          <path d="M9 1.5l1.5 1.5-7 7L2 10.5l.5-1.5 7-7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Share -->
      <ShareButton
        compact
        :doc-id="docId"
        :is-private="isPrivate"
        :shared="shared"
        @set-shared="emit('set-shared', $event)"
      />

      <!-- New doc -->
      <button
        class="flex items-center justify-center w-9 h-9 rounded text-[#999] hover:bg-[#1a1a1a] transition-colors shrink-0"
        title="New document"
        @click="emit('new-doc')"
      >
        <svg width="14" height="14" viewBox="0 0 11 11" fill="none">
          <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </template>
  </header>
</template>
