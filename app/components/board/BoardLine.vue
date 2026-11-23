<script setup lang="ts">
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@vue-flow/core'
import type { BoardLine } from '#shared/board'
import { BOARD_CONTEXT, colorOf } from '~/lib/board'

// A line between two cards, with a word or two on it if you like ("causes", "part of").
// Double-click a line to write on it.
const props = defineProps<EdgeProps<BoardLine>>()
const board = inject(BOARD_CONTEXT)!

const path = computed(() => getBezierPath(props))
const look = computed(() => colorOf(props.data?.color))
const editing = computed(() => board.editingLineId.value === props.id)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

watch(editing, (on) => {
  if (!on) return
  draft.value = props.data?.label ?? ''
  nextTick(() => input.value?.select())
}, { immediate: true })

function done() {
  if (!editing.value) return
  const label = draft.value.trim()
  board.doneLabel(props.id, label === (props.data?.label ?? '') ? null : label)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault()
    input.value?.blur()
  }
}
</script>

<template>
  <BaseEdge
    :id="id"
    :path="path[0]"
    :marker-end="data?.arrow === false ? undefined : markerEnd"
    :interaction-width="22"
    :style="{
      stroke: selected ? '#c7d2fe' : look.line,
      strokeWidth: selected ? 2.5 : 2,
      strokeDasharray: data?.dashed ? '7 6' : undefined,
    }"
  />
  <EdgeLabelRenderer>
    <div
      v-if="editing || data?.label"
      class="board-line-label nodrag nopan"
      :class="{ 'is-selected': selected }"
      :style="{ transform: `translate(-50%, -50%) translate(${path[1]}px, ${path[2]}px)`, borderColor: selected ? '#6366f1' : look.line }"
      @click.stop="board.selectLine(id)"
      @dblclick.stop="board.editLabel(id)"
    >
      <input
        v-if="editing"
        ref="input"
        v-model="draft"
        maxlength="200"
        placeholder="Words on the line"
        class="bg-transparent outline-none text-center w-40 placeholder:text-[#555]"
        @keydown="onKey"
        @blur="done"
      >
      <span v-else>{{ data?.label }}</span>
    </div>
  </EdgeLabelRenderer>
</template>
