<script setup lang="ts">
import { ArrowRightIcon, BanIcon, CalendarDaysIcon, CheckIcon, ListXIcon, RotateCcwIcon } from '@lucide/vue'
import { lineState, type LineTask } from '~/lib/taskLines'

// The menu of a task line in a note. It opens from the line's tag ("Task · not done", ...)
// and has the same choices as the Daily tasks list.
const props = defineProps<{
  task: LineTask
  /** Where the tag is on the screen: the menu opens under it (above it when there is no room). */
  anchor: DOMRect
  today: string
  /** The note can be changed now (not "View", not locked): then "Take off the list" shows. */
  canTakeOff: boolean
}>()

const emit = defineEmits<{
  close: []
  move: [day: string]
  done: [done: boolean]
  cancel: [cancelled: boolean]
  'take-off': []
}>()

const state = computed(() => lineState(props.task, props.today))

const heading = computed(() => {
  switch (state.value) {
    case 'late': return `Planned for ${shortDay(props.task.day)} · not done`
    case 'today': return 'Planned for today'
    case 'later': return `Planned for ${shortDay(props.task.day)}`
    case 'done': return props.task.took && props.task.took > 1 ? `Done · took ${props.task.took} days` : 'Done'
    default: return 'Cancelled'
  }
})

const open = computed(() => state.value === 'late' || state.value === 'today' || state.value === 'later')

// ---- "Pick a date": a date box in the menu ----
const picking = ref(false)
const picked = ref('')
const pickError = ref('')
const dateInput = ref<HTMLInputElement | null>(null)

function startPick() {
  picking.value = true
  pickError.value = ''
  picked.value = addDays(props.task.day < props.today ? props.today : props.task.day, 1)
  void nextTick(() => {
    const el = dateInput.value
    if (!el) return
    el.focus()
    try {
      ;(el as HTMLInputElement & { showPicker?: () => void }).showPicker?.()
    } catch {
      // Some browsers only open the calendar on a click. The box is still there.
    }
  })
}

function confirmPick() {
  if (!picked.value) return
  if (picked.value < props.today) {
    pickError.value = 'Pick today or a later day.'
    return
  }
  if (picked.value === props.task.day) emit('close')
  else emit('move', picked.value)
}

// ---- Where it shows: under the tag, inside the screen ----
const panel = ref<HTMLElement | null>(null)
const pos = ref({ top: -9999, left: 0 })

function place() {
  const el = panel.value
  if (!el) return
  const { width, height } = el.getBoundingClientRect()
  const gap = 6
  const edge = 8
  let top = props.anchor.bottom + gap
  if (top + height > window.innerHeight - edge && props.anchor.top - gap - height > edge) {
    top = props.anchor.top - gap - height
  }
  const left = Math.max(edge, Math.min(props.anchor.left, window.innerWidth - width - edge))
  pos.value = { top: Math.max(edge, top), left }
}

function items() {
  return [...(panel.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
}

onMounted(() => {
  place()
  items()[0]?.focus({ preventScroll: true })
})
watch(picking, () => void nextTick(place))

useClickOutside(panel, () => emit('close'))

// Arrow keys go through the choices; Escape closes the menu.
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
    return
  }
  if (picking.value || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
  e.preventDefault()
  const list = items()
  const i = list.indexOf(document.activeElement as HTMLElement)
  const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length
  list[next]?.focus()
}
</script>

<template>
  <div
    ref="panel"
    class="menu-panel fixed z-[9990] w-60 !p-1.5 text-left"
    :style="{ top: `${pos.top}px`, left: `${pos.left}px` }"
    role="menu"
    aria-label="Task options"
    @keydown="onKey"
  >
    <p class="px-2.5 pt-1 pb-2 mb-1 border-b border-[#1a1a1a] text-xs text-[#777]">{{ heading }}</p>

    <!-- novalidate: our own short message says what is wrong (the browser's would be in its own words) -->
    <form v-if="picking" class="px-2.5 pb-2 pt-1" novalidate @submit.prevent="confirmPick">
      <label class="block text-xs text-[#999] mb-1.5" for="task-line-day">Move to this day</label>
      <input
        id="task-line-day"
        ref="dateInput"
        v-model="picked"
        type="date"
        :min="today"
        class="w-full rounded border border-[#2a2a2a] bg-[#0a0a0a] px-2 py-1.5 text-sm text-[#e5e5e5] [color-scheme:dark] outline-none focus:border-[#6366f1]"
      >
      <p v-if="pickError" class="mt-1.5 text-xs text-[#fca5a5]">{{ pickError }}</p>
      <div class="flex gap-2 mt-2.5">
        <button type="submit" class="btn btn-sm btn-accent flex-1">Move</button>
        <button type="button" class="btn btn-sm flex-1" @click="picking = false">Back</button>
      </div>
    </form>

    <template v-else>
      <template v-if="open">
        <button v-if="state !== 'today'" role="menuitem" class="line-menu-item line-menu-accent" @click="emit('move', today)">
          <ArrowRightIcon :size="15" /> Move to today
        </button>
        <button v-else role="menuitem" class="line-menu-item" @click="emit('move', addDays(task.day, 1))">
          <ArrowRightIcon :size="15" /> Next day
        </button>
        <button role="menuitem" class="line-menu-item" @click="startPick">
          <CalendarDaysIcon :size="15" /> Pick a date
        </button>
        <button role="menuitem" class="line-menu-item" @click="emit('done', true)">
          <CheckIcon :size="15" /> Mark as done
        </button>
        <button role="menuitem" class="line-menu-item" @click="emit('cancel', true)">
          <BanIcon :size="15" /> Cancel task
        </button>
      </template>
      <button v-else-if="state === 'done'" role="menuitem" class="line-menu-item" @click="emit('done', false)">
        <RotateCcwIcon :size="15" /> Mark as not done
      </button>
      <button v-else role="menuitem" class="line-menu-item" @click="emit('cancel', false)">
        <RotateCcwIcon :size="15" /> Undo cancel
      </button>

      <button
        v-if="canTakeOff"
        role="menuitem"
        class="line-menu-item"
        title="The line stays in your note"
        @click="emit('take-off')"
      >
        <ListXIcon :size="15" /> Take off the list
      </button>
    </template>
  </div>
</template>

<style scoped>
.line-menu-item {
  @apply flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded text-sm text-[#bbb] transition-colors hover:bg-[#1a1a1a] hover:text-[#f0f0f0] focus-visible:bg-[#1a1a1a] focus-visible:text-[#f0f0f0] outline-none;
}
.line-menu-accent {
  @apply text-[#a5b4fc] hover:text-[#c7d2fe] focus-visible:text-[#c7d2fe];
}
</style>
