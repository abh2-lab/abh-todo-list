<script setup lang="ts">
import { EyeIcon, LockIcon, MenuIcon, PencilIcon, PlusIcon } from '@lucide/vue'
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
  /** The text of the open note (for "Copy for AI" in the Share menu). */
  content: Record<string, any> | null
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
      data-tour="menu"
      class="relative flex items-center justify-center w-9 h-9 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
      :class="sidebarOpen ? 'text-[#6366f1]' : 'text-[#999]'"
      :title="pendingCount ? `Menu (${pendingCount} pending ${pendingCount === 1 ? 'task' : 'tasks'})` : (sidebarOpen ? 'Hide notes' : 'Show notes')"
      @click="emit('toggle-sidebar')"
    >
      <MenuIcon :size="20" />
      <span
        v-if="pendingCount > 0"
        class="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#ef4444] ring-2 ring-black"
      />
    </button>

    <!-- Title -->
    <div v-if="view === 'notes'" class="flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden">
      <span v-if="isPrivate" class="shrink-0 text-[#6366f1]" title="Private note: only you can see it">
        <LockIcon :size="13" />
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
        data-tour="title"
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
        data-tour="view-mode"
        class="flex items-center justify-center w-9 h-9 rounded transition-colors shrink-0"
        :class="viewMode
          ? 'text-[#818cf8] bg-[#6366f1]/10'
          : 'text-[#999] hover:bg-[#1a1a1a]'"
        :title="viewMode ? 'Switch to edit mode' : 'Switch to view mode'"
        @click="emit('toggle-view-mode')"
      >
        <EyeIcon v-if="!viewMode" :size="18" />
        <PencilIcon v-else :size="18" />
      </button>

      <!-- Share -->
      <ShareButton
        data-tour="share"
        compact
        :doc-id="docId"
        :is-private="isPrivate"
        :shared="shared"
        :title="title"
        :content="content"
        @set-shared="emit('set-shared', $event)"
      />

      <!-- New doc -->
      <button
        class="flex items-center justify-center w-9 h-9 rounded text-[#999] hover:bg-[#1a1a1a] transition-colors shrink-0"
        data-tour="new-note"
        title="New document"
        @click="emit('new-doc')"
      >
        <PlusIcon :size="18" />
      </button>
    </template>
  </header>
</template>
