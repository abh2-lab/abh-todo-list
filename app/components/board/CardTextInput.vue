<script setup lang="ts">
import { MAX_TEXT } from '#shared/board'

// The words of a text card, while you write them (on the Mind map and on the Kanban).
// Enter makes a new line. Esc or Ctrl+Enter (or a click outside): done.
const props = defineProps<{ value?: string }>()
const emit = defineEmits<{ done: [text: string | null] }>()

const draft = ref(props.value ?? '')
const area = ref<HTMLTextAreaElement | null>(null)
let finished = false

function fit() {
  const el = area.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

// A new card on the Mind map is hidden for a moment (until the board has measured it), and a
// hidden box can't take the cursor: so try again for a little while.
function focusArea(tries = 30) {
  const el = area.value
  if (!el || finished) return
  fit()
  el.focus()
  if (document.activeElement === el) el.select()
  else if (tries > 0) setTimeout(() => focusArea(tries - 1), 50)
}

onMounted(() => nextTick(() => focusArea()))

/** The words, or null when they did not change. */
function done() {
  if (finished) return
  finished = true
  const text = draft.value.trim() === '' ? '' : draft.value.replace(/\s+$/, '')
  emit('done', text === (props.value ?? '') ? null : text)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
    e.preventDefault()
    area.value?.blur()
  }
}
</script>

<template>
  <textarea
    ref="area"
    v-model="draft"
    rows="1"
    :maxlength="MAX_TEXT"
    class="nodrag nowheel nopan block w-full resize-none bg-transparent outline-none text-inherit placeholder:text-[#555]"
    placeholder="Write here…"
    @input="fit"
    @keydown="onKey"
    @blur="done"
  />
</template>
