<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl, ResizeControlVariant } from '@vue-flow/node-resizer'
import { FileTextIcon, PaperclipIcon } from '@lucide/vue'
import { opensInBrowser, type BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf } from '~/lib/board'
import { downloadBoardFile, fileKindText, fileSizeText, fileUrl, openBoardFile } from '~/lib/boardFiles'
import CardHandles from './CardHandles.vue'
import CardNameInput from './CardNameInput.vue'

// A file on the board (a PDF, a Word file, …): its name, kind and size.
// Double-click it to open it (PDFs open in a new tab, other files are downloaded).
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const look = computed(() => colorOf(props.data.color))
const editing = computed(() => board.editingId.value === props.id)
const shows = computed(() => opensInBrowser(props.data.fileType))
const about = computed(() => [fileKindText(props.data.fileName, props.data.fileType), fileSizeText(props.data.fileSize)].filter(Boolean).join(' · '))
const href = computed(() => (props.data.fileId ? fileUrl(props.data.fileId, !shows.value) : undefined))

function open() {
  const id = props.data.fileId
  if (!id) return
  if (shows.value) openBoardFile(id)
  else downloadBoardFile(id, props.data.fileName)
}
</script>

<template>
  <div
    class="board-card h-full"
    :class="{ 'is-selected': selected }"
    :style="{ borderColor: look.border, background: look.bg }"
    @dblclick.stop="open"
  >
    <CardHandles />
    <NodeResizeControl
      :node-id="id"
      position="right"
      :variant="ResizeControlVariant.Line"
      class="board-resize"
      :min-width="160"
      :max-width="900"
      @resize-end="board.resized(id, { w: $event.params.width })"
    />

    <div class="flex items-center gap-1.5 mb-1.5 text-[11px] text-[#666] select-none min-w-0">
      <FileTextIcon v-if="data.fileType === 'application/pdf'" :size="12" class="shrink-0" />
      <PaperclipIcon v-else :size="12" class="shrink-0" />
      <span class="truncate">{{ about }}</span>
    </div>
    <CardNameInput v-if="editing" :value="data.text" placeholder="Name of the file" @done="(name) => board.doneText(id, name)" />
    <div v-else class="text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
      {{ data.text || data.fileName }}
    </div>
    <a
      v-if="href"
      class="nodrag block mt-1 truncate text-[12px] text-[#818cf8] hover:underline"
      :href="href"
      :target="shows ? '_blank' : undefined"
      :download="shows ? undefined : data.fileName"
      rel="noopener noreferrer"
      :title="shows ? 'Open it in a new tab' : 'Download it'"
      @dblclick.stop
    >{{ data.text ? data.fileName : shows ? 'Open' : 'Download' }}</a>
  </div>
</template>
