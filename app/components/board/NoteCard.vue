<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl, ResizeControlVariant } from '@vue-flow/node-resizer'
import { FileTextIcon, LockIcon } from '@lucide/vue'
import type { BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf } from '~/lib/board'
import CardHandles from './CardHandles.vue'

// A note on the board: its name and first words. Double-click to read it in the side panel.
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const note = computed(() => (props.data.docId ? board.notes.value.get(props.data.docId) : undefined))
const look = computed(() => colorOf(props.data.color))
</script>

<template>
  <div
    class="board-card h-full"
    :class="{ 'is-selected': selected }"
    :style="{ borderColor: look.border, background: look.bg }"
    @dblclick.stop="data.docId && board.read(data.docId)"
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

    <div class="flex items-center gap-1.5 mb-1.5 text-[11px] uppercase tracking-wider text-[#666] select-none">
      <LockIcon v-if="note?.isPrivate" :size="12" />
      <FileTextIcon v-else :size="12" />
      Note
    </div>
    <div class="text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
      {{ note?.title || 'Untitled' }}
    </div>
    <p v-if="note?.preview" class="mt-1.5 text-[13px] leading-relaxed text-[#9a9a9a] break-words line-clamp-4">
      {{ note.preview }}
    </p>
    <p v-else class="mt-1.5 text-[13px] italic text-[#555]">Empty note</p>
  </div>
</template>
