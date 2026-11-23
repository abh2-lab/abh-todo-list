<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl, ResizeControlVariant } from '@vue-flow/node-resizer'
import type { BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf } from '~/lib/board'
import CardHandles from './CardHandles.vue'
import CardTextInput from './CardTextInput.vue'

// A text card: an idea, a question, a heading. "Topic" cards are big and bold (the middle
// of a mind map). Double-click to write in it; click outside or press Esc when done.
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const look = computed(() => colorOf(props.data.color))
const editing = computed(() => board.editingId.value === props.id)
</script>

<template>
  <div
    class="board-card h-full"
    :class="{ 'is-selected': selected, 'is-topic': data.style === 'topic' }"
    :style="{ borderColor: look.border, background: look.bg }"
    @dblclick.stop="board.editText(id)"
  >
    <CardHandles />
    <NodeResizeControl
      :node-id="id"
      position="right"
      :variant="ResizeControlVariant.Line"
      class="board-resize"
      :min-width="100"
      :max-width="900"
      @resize-end="board.resized(id, { w: $event.params.width })"
    />

    <CardTextInput v-if="editing" :value="data.text" @done="(text) => board.doneText(id, text)" />
    <div v-else-if="data.text" class="whitespace-pre-wrap break-words">{{ data.text }}</div>
    <div v-else class="italic text-[#555] select-none">Double-click to write</div>
  </div>
</template>
