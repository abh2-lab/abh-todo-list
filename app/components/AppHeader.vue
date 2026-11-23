<script setup lang="ts">
import { EyeIcon, LockIcon, PanelLeftIcon, PencilIcon, PlusIcon } from '@lucide/vue'
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

const { loggedIn } = useUserSession()

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
        data-tour="menu"
        class="flex items-center justify-center w-8 h-8 rounded hover:bg-[#1a1a1a] transition-colors shrink-0"
        :class="sidebarOpen ? 'text-[#6366f1]' : 'text-[#555] hover:text-[#f0f0f0]'"
        :title="sidebarOpen ? 'Hide notes' : 'Show notes'"
        @click="emit('toggle-sidebar')"
      >
        <PanelLeftIcon :size="18" />
      </button>

      <div class="w-px h-5 bg-[#1f1f1f] shrink-0" />

      <div v-if="view === 'notes'" class="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
        <span v-if="isPrivate" class="shrink-0 text-[#6366f1]" title="Private note: only you can see it">
          <LockIcon :size="14" />
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
          data-tour="title"
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

    <!-- Right: only on the Notes page. The button names show on wide screens (xl); on smaller
         screens there is no room next to the middle part, so only the icons show. -->
    <div class="flex items-center justify-end gap-2.5 min-w-0">
      <template v-if="view === 'notes'">
        <div
          class="shrink-0 text-xs transition-all duration-300 md:min-w-[40px] text-right"
          :class="{
            'text-[#6366f1]': saveStatus === 'saving',
            'text-[#3a3a3a]': saveStatus === 'unsaved',
            'text-[#1f1f1f]': saveStatus === 'saved',
          }"
        >
          <!-- Small screens: a dot (as on phones). Bigger screens: the words. -->
          <template v-if="saveStatus !== 'saved'">
            <span
              class="md:hidden block w-1.5 h-1.5 rounded-full bg-current"
              :class="{ 'animate-pulse': saveStatus === 'saving' }"
              :title="saveStatus === 'saving' ? 'Saving…' : 'Unsaved'"
            />
            <span class="hidden md:inline" :class="{ 'animate-pulse': saveStatus === 'saving' }">
              {{ saveStatus === 'saving' ? 'Saving…' : 'Unsaved' }}
            </span>
          </template>
        </div>

        <button
          data-tour="view-mode"
          class="flex items-center gap-1.5 text-btn px-3 max-md:px-2 py-1.5 rounded border transition-colors shrink-0"
          :class="viewMode
            ? 'bg-[#6366f1]/10 border-[#6366f1]/30 text-[#818cf8] hover:bg-[#6366f1]/20'
            : 'bg-[#111] border-[#1f1f1f] text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'"
          :title="viewMode ? 'Switch to edit mode' : 'Switch to view mode'"
          @click="emit('toggle-view-mode')"
        >
          <EyeIcon v-if="!viewMode" :size="16" />
          <PencilIcon v-else :size="16" />
          <span class="hidden xl:inline">{{ viewMode ? 'Edit' : 'View' }}</span>
        </button>

        <!-- Groups of notes (with a Mind map board each): logged in only -->
        <GroupButton v-if="loggedIn" :doc-id="docId" />

        <ShareButton
          data-tour="share"
          :doc-id="docId"
          :is-private="isPrivate"
          :shared="shared"
          :title="title"
          :content="content"
          @set-shared="emit('set-shared', $event)"
        />

        <button
          class="flex items-center gap-1.5 text-btn px-3 max-md:px-2 py-1.5 rounded bg-[#111] hover:bg-[#1a1a1a] text-[#888] hover:text-[#f0f0f0] border border-[#1f1f1f] transition-colors shrink-0"
          data-tour="new-note"
          title="New document"
          @click="emit('new-doc')"
        >
          <PlusIcon :size="16" />
          <span class="hidden xl:inline">New</span>
        </button>
      </template>
    </div>
  </header>
</template>
