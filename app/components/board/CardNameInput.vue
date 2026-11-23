<script setup lang="ts">
import { MAX_LABEL } from '#shared/board'
import { BOARD_CONTEXT } from '~/lib/board'

// The name of a link or video card, while you write it. Enter or Esc (or a click outside): done.
const props = defineProps<{ id: string; value?: string; placeholder: string }>()
const board = inject(BOARD_CONTEXT)!

const draft = ref(props.value ?? '')
const input = ref<HTMLInputElement | null>(null)

// A new card is hidden for a moment (until the board has measured it): try again for a little while.
function focusInput(tries = 30) {
  const el = input.value
  if (!el) return
  el.focus()
  if (document.activeElement === el) el.select()
  else if (tries > 0) setTimeout(() => focusInput(tries - 1), 50)
}

onMounted(() => nextTick(() => focusInput()))

function done() {
  const name = draft.value.trim()
  board.doneText(props.id, name === (props.value ?? '') ? null : name)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === 'Escape') {
    e.preventDefault()
    input.value?.blur()
  }
}
</script>

<template>
  <input
    ref="input"
    v-model="draft"
    :maxlength="MAX_LABEL"
    :placeholder="placeholder"
    class="nodrag nopan block w-full bg-transparent outline-none border-b border-[#6366f1]/60 text-[15px] font-semibold leading-snug text-[#f0f0f0] placeholder:text-[#555] placeholder:font-normal"
    @keydown="onKey"
    @blur="done"
  >
</template>
