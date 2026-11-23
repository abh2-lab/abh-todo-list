<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon, EllipsisIcon, GripVerticalIcon, PencilIcon, Trash2Icon } from '@lucide/vue'
import { BOARD_COLORS, type BoardColor } from '#shared/board'
import { MAX_COLUMN_NAME, type KanbanColumn } from '#shared/kanban'
import { COLORS } from '~/lib/board'

// The top of a Kanban column: its name (click it to rename the column), how many cards are in
// it, and a menu (rename, color, move, delete). Drag the name to move the column.
// (The drag reaches the Kanban itself: @dragstart and @dragend.)
const props = defineProps<{
  column: KanbanColumn
  /** Cards shown in it. */
  count: number
  renaming: boolean
  canMoveLeft: boolean
  canMoveRight: boolean
  canDelete: boolean
}>()

const emit = defineEmits<{
  /** Start renaming. */
  rename: []
  /** The new name, or null when it did not change. */
  renamed: [name: string | null]
  color: [color: BoardColor]
  move: [step: -1 | 1]
  remove: []
  dragstart: [e: DragEvent]
  dragend: [e: DragEvent]
}>()

const current = computed<BoardColor>(() => props.column.color ?? 'gray')

// ---- Renaming ----
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)
let cancelled = false

watch(
  () => props.renaming,
  (on) => {
    if (!on) return
    draft.value = props.column.name
    cancelled = false
    nextTick(() => {
      input.value?.focus()
      input.value?.select()
    })
  },
  { immediate: true },
)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault()
    cancelled = e.key === 'Escape'
    input.value?.blur()
  }
}

function onBlur() {
  const name = draft.value.trim()
  emit('renamed', cancelled || !name || name === props.column.name ? null : name)
}

// ---- The menu ----
const menuOpen = ref(false)
const menu = ref<HTMLElement | null>(null)
useClickOutside(menu, () => (menuOpen.value = false))

function pick(action: () => void) {
  menuOpen.value = false
  action()
}
</script>

<template>
  <div class="flex items-center gap-1 pl-1.5 pr-1.5 py-2 shrink-0">
    <div
      class="group/head flex-1 min-w-0 flex items-center gap-1.5"
      :class="renaming ? '' : 'cursor-grab'"
      :draggable="!renaming"
      @dragstart="emit('dragstart', $event)"
      @dragend="emit('dragend', $event)"
    >
      <GripVerticalIcon :size="14" class="shrink-0 text-[#333] group-hover/head:text-[#777]" />
      <span class="w-2 h-2 rounded-full shrink-0" :style="{ background: COLORS[current].line }" />
      <input
        v-if="renaming"
        ref="input"
        v-model="draft"
        :maxlength="MAX_COLUMN_NAME"
        aria-label="Name of the column"
        class="flex-1 min-w-0 bg-[#0d0d0d] border border-[#6366f1]/50 rounded px-1.5 py-0.5 text-sm text-[#f0f0f0] outline-none"
        @keydown="onKey"
        @blur="onBlur"
      >
      <button
        v-else
        class="min-w-0 text-left truncate text-sm font-medium text-[#ddd] hover:text-white"
        :title="`${column.name}: click to rename it, drag to move the column`"
        @click="emit('rename')"
      >
        {{ column.name }}
      </button>
      <span class="text-2xs text-[#555] tabular-nums shrink-0 select-none">{{ count }}</span>
    </div>

    <div ref="menu" class="relative shrink-0" @keydown.esc="menuOpen = false">
      <button
        class="w-6 h-6 flex items-center justify-center rounded text-[#555] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
        title="Color, move or delete the column"
        :aria-expanded="menuOpen"
        @click="menuOpen = !menuOpen"
      >
        <EllipsisIcon :size="15" />
      </button>
      <div
        v-if="menuOpen"
        class="absolute right-0 top-7 z-30 w-52 p-1 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black"
        role="menu"
        :aria-label="`Column ${column.name}`"
      >
        <button role="menuitem" class="column-menu-item" @click="pick(() => emit('rename'))">
          <PencilIcon :size="14" />
          Rename
        </button>
        <div class="flex items-center gap-0.5 px-1.5 py-1" role="group" aria-label="Color">
          <button
            v-for="c in BOARD_COLORS"
            :key="c"
            class="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1a1a1a]"
            :title="COLORS[c].name"
            :aria-pressed="current === c"
            @click="pick(() => emit('color', c))"
          >
            <span
              class="w-3.5 h-3.5 rounded-full border-2"
              :style="{ borderColor: COLORS[c].line, background: current === c ? COLORS[c].line : 'transparent' }"
            />
          </button>
        </div>
        <button role="menuitem" class="column-menu-item" :disabled="!canMoveLeft" @click="pick(() => emit('move', -1))">
          <ArrowLeftIcon :size="14" />
          Move left
        </button>
        <button role="menuitem" class="column-menu-item" :disabled="!canMoveRight" @click="pick(() => emit('move', 1))">
          <ArrowRightIcon :size="14" />
          Move right
        </button>
        <div class="h-px my-1 bg-[#1a1a1a]" />
        <button
          role="menuitem"
          class="column-menu-item is-danger"
          :disabled="!canDelete"
          :title="canDelete ? 'Delete the column and its cards (Ctrl+Z brings them back)' : 'A Kanban needs at least one column'"
          @click="pick(() => emit('remove'))"
        >
          <Trash2Icon :size="14" />
          Delete column
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.column-menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  color: #aaa;
  font-size: 13px;
  text-align: left;
}

.column-menu-item:hover:not(:disabled) {
  background: #1a1a1a;
  color: #f0f0f0;
}

.column-menu-item.is-danger:hover:not(:disabled) {
  color: #fca5a5;
}

.column-menu-item:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
