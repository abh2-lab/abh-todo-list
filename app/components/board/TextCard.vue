<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl } from '@vue-flow/node-resizer'
import type { BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf } from '~/lib/board'
import CardHandles from './CardHandles.vue'

// A text card: an idea, a question, a heading. "Topic" cards are big and bold (the middle
// of a mind map). Double-click to write in it; click outside or press Esc when done.
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const look = computed(() => colorOf(props.data.color))
const editing = computed(() => board.editingId.value === props.id)
const draft = ref('')
const area = ref<HTMLTextAreaElement | null>(null)

function fit() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// A new card is hidden for a moment (until the board has measured it), and a hidden box
// can't take the cursor: so try again for a little while.
function focusArea(tries = 30) {
  const el = area.value
  if (!el || !editing.value) return
  fit()
  el.focus()
  if (document.activeElement === el) el.select()
  else if (tries > 0) setTimeout(() => focusArea(tries - 1), 50)
}

watch(editing, (on) => {
  if (!on) return
  draft.value = props.data.text ?? ''
  nextTick(() => focusArea())
}, { immediate: true })

function done() {
  if (!editing.value) return
  const text = draft.value.trim() === '' ? '' : draft.value.replace(/\s+$/, '')
  board.doneText(props.id, text === (props.data.text ?? '') ? null : text)
}

function onKey(e: KeyboardEvent) {
  // Esc or Ctrl+Enter: done. Enter alone makes a new line.
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault()
    area.value?.blur()
  }
}
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
      variant="line"
      class="board-resize"
      :min-width="100"
      :max-width="900"
      @resize-end="board.resized(id, { w: $event.params.width })"
    />

    <textarea
      v-if="editing"
      ref="area"
      v-model="draft"
      rows="1"
      maxlength="5000"
      class="nodrag nowheel nopan block w-full resize-none bg-transparent outline-none text-inherit placeholder:text-[#555]"
      placeholder="Write here…"
      @input="fit"
      @keydown="onKey"
      @blur="done"
    />
    <div v-else-if="data.text" class="whitespace-pre-wrap break-words">{{ data.text }}</div>
    <div v-else class="italic text-[#555] select-none">Double-click to write</div>
  </div>
</template>
