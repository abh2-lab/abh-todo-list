<script setup lang="ts">
import { ChevronLeftIcon, FileTextIcon, KanbanIcon, LinkIcon, NetworkIcon, TypeIcon, UploadIcon } from '@lucide/vue'
import type { SaveState } from '~/composables/useBoardSaving'

// The top of a group's board: back to the notes, the group's name (click it to rename the
// group), whether the board is saved, the switch between the group's two boards (the Mind map
// and the Kanban), and the buttons that add cards.
const props = defineProps<{
  groupId: string
  view: 'map' | 'kanban'
  /** The group's name ('' while it loads). */
  name: string
  loaded: boolean
  failed: boolean
  saveState: SaveState
  saveText: string
  /** "Uploading… 40%", or ''. */
  uploadText: string
}>()

const emit = defineEmits<{
  renamed: [name: string]
  error: [text: string]
  note: []
  text: []
  link: []
  /** The File button: the board calls pickFiles(), then `files` comes with what was picked. */
  file: []
  files: [files: File[]]
}>()

const { renameGroup } = useGroups()

// ---- The group's name ----
const renaming = ref(false)
const draft = ref('')
/** The new name, while it is being saved. */
const saving = ref<string | null>(null)
const nameInput = ref<HTMLInputElement | null>(null)
const shownName = computed(() => saving.value ?? props.name)

function startRename() {
  draft.value = shownName.value
  renaming.value = true
  nextTick(() => nameInput.value?.select())
}

async function finishRename() {
  if (!renaming.value) return
  renaming.value = false
  const next = draft.value.trim().replace(/\s+/g, ' ')
  if (!next || next === shownName.value) return
  saving.value = next
  try {
    emit('renamed', await renameGroup(props.groupId, next))
  } catch (e) {
    emit('error', errorMessage(e) ?? 'Could not rename the group. Check your connection.')
  } finally {
    saving.value = null
  }
}

function onNameKey(e: KeyboardEvent) {
  if (e.key === 'Enter') nameInput.value?.blur()
  else if (e.key === 'Escape') {
    draft.value = shownName.value
    nameInput.value?.blur()
  }
}

// ---- Pictures and files from the computer ----
const fileInput = ref<HTMLInputElement | null>(null)

function pickFiles() {
  fileInput.value?.click()
}

function onFilesPicked() {
  const input = fileInput.value
  if (!input) return
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) emit('files', files)
}

defineExpose({ pickFiles })

const isMap = computed(() => props.view === 'map')
const titles = computed(() =>
  isMap.value
    ? {
        note: 'Add one of your notes, or a new note',
        text: 'Add a text card (or double-click an empty place on the board)',
        link: 'Add a web page or a YouTube video (or copy a link and press Ctrl+V on the board)',
        file: 'Add pictures or files from your computer (or drag them onto the board, or paste a picture with Ctrl+V)',
      }
    : {
        note: 'Add one of your notes, or a new note, to the first column',
        text: 'Add a text card to the first column',
        link: 'Add a web page or a YouTube video to the first column (or copy a link and press Ctrl+V over a column)',
        file: 'Add pictures or files to the first column (or drag them onto a column, or paste a picture with Ctrl+V)',
      },
)
</script>

<template>
  <header class="flex items-center gap-3 px-4 h-12 border-b border-[#1f1f1f] bg-black shrink-0">
    <NuxtLink
      to="/"
      class="flex items-center gap-1 text-2xs text-[#555] hover:text-[#999] transition-colors shrink-0"
      title="Back to your notes"
    >
      <ChevronLeftIcon :size="14" />
      Notes
    </NuxtLink>
    <span class="text-[#1f1f1f] select-none">/</span>
    <input
      v-if="renaming"
      ref="nameInput"
      v-model="draft"
      maxlength="100"
      aria-label="Name of the group"
      class="w-56 bg-[#0d0d0d] border border-[#6366f1]/50 rounded px-2 py-1 text-sm text-[#f0f0f0] outline-none"
      @keydown="onNameKey"
      @blur="finishRename"
    >
    <button
      v-else
      class="min-w-0 truncate max-w-[30vw] text-sm font-medium text-[#ddd] hover:text-white"
      :title="loaded ? 'Rename the group' : undefined"
      :disabled="!loaded"
      @click="startRename"
    >
      {{ shownName || (failed ? 'Board' : 'Loading…') }}
    </button>
    <span
      v-if="loaded"
      class="text-2xs shrink-0"
      :class="saveState === 'error' ? 'text-[#fca5a5]' : 'text-[#444]'"
      aria-live="polite"
    >
      {{ saveText }}
    </span>
    <span v-if="uploadText" class="text-2xs text-[#818cf8] shrink-0 tabular-nums" aria-live="polite">{{ uploadText }}</span>
    <span class="hidden 2xl:inline text-2xs text-[#333] shrink-0 select-none">Only you can see this board</span>

    <div class="flex-1" />

    <!-- The group's two boards -->
    <nav class="flex items-center gap-0.5 p-0.5 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b] shrink-0" aria-label="Boards of this group">
      <NuxtLink
        :to="{ query: { view: 'map' } }"
        replace
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors"
        :class="isMap ? 'bg-[#1a1a1a] text-[#f0f0f0]' : 'text-[#666] hover:text-[#ccc]'"
        :aria-current="isMap ? 'page' : undefined"
        title="Mind map: put cards anywhere and join them with lines"
      >
        <NetworkIcon :size="14" :class="isMap ? 'text-[#818cf8]' : ''" />
        <span class="hidden md:inline">Mind map</span>
      </NuxtLink>
      <NuxtLink
        :to="{ query: { view: 'kanban' } }"
        replace
        class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-colors"
        :class="!isMap ? 'bg-[#1a1a1a] text-[#f0f0f0]' : 'text-[#666] hover:text-[#ccc]'"
        :aria-current="!isMap ? 'page' : undefined"
        title="Kanban: cards in columns, like To learn, Learning and Done"
      >
        <KanbanIcon :size="14" :class="!isMap ? 'text-[#818cf8]' : ''" />
        <span class="hidden md:inline">Kanban</span>
      </NuxtLink>
    </nav>

    <div class="flex-1" />

    <button class="btn btn-sm" :disabled="!loaded" :title="titles.note" @click="emit('note')">
      <FileTextIcon :size="14" />
      <span class="hidden lg:inline">Note</span>
    </button>
    <button class="btn btn-sm" :disabled="!loaded" :title="titles.text" @click="emit('text')">
      <TypeIcon :size="14" />
      <span class="hidden lg:inline">Text</span>
    </button>
    <button class="btn btn-sm" :disabled="!loaded" :title="titles.link" @click="emit('link')">
      <LinkIcon :size="14" />
      <span class="hidden lg:inline">Link</span>
    </button>
    <button class="btn btn-sm" :disabled="!loaded" :title="titles.file" @click="emit('file')">
      <UploadIcon :size="14" />
      <span class="hidden lg:inline">File</span>
    </button>
    <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked">
  </header>
</template>
