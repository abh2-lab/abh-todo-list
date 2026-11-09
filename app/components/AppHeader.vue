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
}>()

const emit = defineEmits<{
  'update:title': [value: string]
  'toggle-sidebar': []
  'toggle-view-mode': []
  'new-doc': []
  'set-shared': [on: boolean]
  'update:view': [view: AppView]
  'open-pending': []
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
  <header class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 h-12 border-b border-[#1f1f1f] bg-black shrink-0 z-20">
    <!-- Left: same as before (notes list button and the note title) -->
    <div class="flex items-center gap-2.5 min-w-0">
      <button
        class="flex items-center justify-center w-8 h-8 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
        :class="sidebarOpen ? 'text-[#6366f1]' : 'text-[#555] hover:text-[#f0f0f0]'"
        :title="sidebarOpen ? 'Hide notes' : 'Show notes'"
        @click="emit('toggle-sidebar')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="2.5" width="14" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="1" y="7.25" width="10" height="1.5" rx="0.75" fill="currentColor"/>
          <rect x="1" y="12" width="12" height="1.5" rx="0.75" fill="currentColor"/>
        </svg>
      </button>

      <div class="w-px h-5 bg-[#1f1f1f] shrink-0" />

      <div v-if="view === 'notes'" class="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span v-if="isPrivate" class="shrink-0 text-[#6366f1]" title="Private note: only you can see it">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <rect x="3" y="6.25" width="8" height="5.75" rx="1" stroke="currentColor" stroke-width="1.2"/>
            <path d="M4.75 6.25V4.5a2.25 2.25 0 014.5 0v1.75" stroke="currentColor" stroke-width="1.2"/>
          </svg>
        </span>
        <input
          v-if="editingTitle"
          ref="titleInput"
          v-model="localTitle"
          class="bg-transparent text-base text-[#f0f0f0] outline-none border-b border-[#6366f1] min-w-0 max-w-sm"
          @blur="commitTitle"
          @keydown="onTitleKeydown"
        />
        <button
          v-else
          class="text-base truncate max-w-sm text-left transition-colors"
          :class="viewMode ? 'text-[#888] cursor-default' : 'text-[#c0c0c0] hover:text-[#f0f0f0]'"
          @click="startEditTitle"
        >
          {{ localTitle }}
        </button>

        <span
          v-if="viewMode"
          class="text-xs px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#6366f1] border border-[#6366f1]/30 font-medium shrink-0"
        >
          View
        </span>
      </div>
      <span v-else class="text-base text-[#c0c0c0] truncate">Daily tasks</span>
    </div>

    <!-- Center: who is logged in, and the parts of the app -->
    <AppNav
      :view="view"
      :pending-count="pendingCount"
      @update:view="emit('update:view', $event)"
      @open-pending="emit('open-pending')"
    />

    <!-- Right: same as before (only on the Notes page) -->
    <div class="flex items-center justify-end gap-2.5 min-w-0">
      <template v-if="view === 'notes'">
        <div
          class="shrink-0 text-xs transition-all duration-300 min-w-[40px] text-right"
          :class="{
            'text-[#6366f1]': saveStatus === 'saving',
            'text-[#3a3a3a]': saveStatus === 'unsaved',
            'text-[#1f1f1f]': saveStatus === 'saved',
          }"
        >
          <span v-if="saveStatus === 'saving'" class="animate-pulse">Saving…</span>
          <span v-else-if="saveStatus === 'unsaved'">Unsaved</span>
        </div>

        <button
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors shrink-0"
          :class="viewMode
            ? 'bg-[#6366f1]/10 border-[#6366f1]/30 text-[#818cf8] hover:bg-[#6366f1]/20'
            : 'bg-[#111] border-[#1f1f1f] text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'"
          :title="viewMode ? 'Switch to edit mode' : 'Switch to view mode'"
          @click="emit('toggle-view-mode')"
        >
          <svg v-if="!viewMode" width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="2" stroke="currentColor" stroke-width="1.2"/>
            <path d="M1 6C2 3.5 3.8 2 6 2s4 1.5 5 4c-1 2.5-2.8 4-5 4s-4-1.5-5-4z" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          <svg v-else width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M9 1.5l1.5 1.5-7 7L2 10.5l.5-1.5 7-7z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          </svg>
          <span class="hidden lg:inline">{{ viewMode ? 'Edit' : 'View' }}</span>
        </button>

        <ShareButton
          :doc-id="docId"
          :is-private="isPrivate"
          :shared="shared"
          @set-shared="emit('set-shared', $event)"
        />

        <button
          class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-[#111] hover:bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0] border border-[#1f1f1f] transition-colors shrink-0"
          title="New document"
          @click="emit('new-doc')"
        >
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span class="hidden lg:inline">New</span>
        </button>
      </template>
    </div>
  </header>
</template>
