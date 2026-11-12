<script setup lang="ts">
// A month calendar with one dot per task. Used by Daily tasks and by its share page.
// green = done, red = not done and the day is over, grey = not done yet
interface DayTask {
  day: string
  done: boolean
}

const props = defineProps<{
  year: number
  /** 0 = January */
  month: number
  today: string
  selected: string
  tasks: DayTask[]
  loading?: boolean
  error?: string
  /** The first and the last month the arrows can go to, like "2026-09" (the share page). */
  min?: string
  max?: string
  /** Show the "Today" button. */
  todayButton?: boolean
}>()

const emit = defineEmits<{
  pick: [day: string]
  'change-month': [step: number]
  today: []
}>()

const grid = computed(() => monthGrid(props.year, props.month))
const monthPrefix = computed(() => `${props.year}-${String(props.month + 1).padStart(2, '0')}`)
const monthLabel = computed(() =>
  new Date(props.year, props.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
)
const canGoBack = computed(() => !props.min || monthPrefix.value > props.min)
const canGoOn = computed(() => !props.max || monthPrefix.value < props.max)
// Mon … Sun (2024-01-01 was a Monday)
const weekdays = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }),
)

const byDay = computed(() => {
  const map = new Map<string, DayTask[]>()
  for (const t of props.tasks) {
    const list = map.get(t.day)
    if (list) list.push(t)
    else map.set(t.day, [t])
  }
  return map
})

const monthStats = computed(() => {
  let done = 0
  let notDone = 0
  let toDo = 0
  for (const t of props.tasks) {
    if (!t.day.startsWith(monthPrefix.value)) continue
    if (t.done) done++
    else if (t.day < props.today) notDone++
    else toDo++
  }
  return { done, notDone, toDo }
})

function dotClass(t: DayTask) {
  if (t.done) return 'bg-[#22c55e]'
  if (t.day < props.today) return 'bg-[#ef4444]'
  return 'bg-[#4a4a4a]'
}

// ---- Dots in the calendar: as many as fit in a day box, then "+3" for the rest ----
// A dot is 6px wide with 3px between dots, so each dot takes 9px.
const DOT_STEP = 9
const DOT_GAP = 3
const gridEl = ref<HTMLElement | null>(null)
// How many dots fit across and down in one day box. All day boxes are the same size.
const dotRoom = ref({ cols: 8, rows: 1 })

function measureDots() {
  const box = gridEl.value?.querySelector<HTMLElement>('[data-dots]')
  if (!box || !box.clientWidth) return // not on screen yet
  // The exact size (like 58.6px), not the rounded one, so a dot never has to go to a new line.
  const size = getComputedStyle(box)
  const cols = Math.max(1, Math.floor((parseFloat(size.width) + DOT_GAP) / DOT_STEP))
  const rows = Math.max(1, Math.floor((parseFloat(size.height) + DOT_GAP) / DOT_STEP))
  if (cols !== dotRoom.value.cols || rows !== dotRoom.value.rows) dotRoom.value = { cols, rows }
}

interface DayDots { dots: DayTask[]; more: number; moreWidth: number }
const NO_DOTS: DayDots = { dots: [], more: 0, moreWidth: 0 }

const dotsByDay = computed(() => {
  const { cols, rows } = dotRoom.value
  const room = cols * rows
  const out = new Map<string, DayDots>()
  for (const [day, list] of byDay.value) {
    if (list.length <= room) {
      out.set(day, { dots: list, more: 0, moreWidth: 0 })
      continue
    }
    // "+3" takes the place of the last 2 dots ("+12" needs 3 places, "+123" needs 4).
    let places = 2
    if (list.length - (room - places) >= 10) places = 3
    if (list.length - (room - places) >= 100) places = 4
    places = Math.min(places, cols)
    const shown = Math.max(0, room - places)
    out.set(day, { dots: list.slice(0, shown), more: list.length - shown, moreWidth: places * DOT_STEP - DOT_GAP })
  }
  return out
})

function dotsOf(day: string) {
  return dotsByDay.value.get(day) ?? NO_DOTS
}

let dotObserver: ResizeObserver | null = null
onMounted(() => {
  measureDots()
  dotObserver = new ResizeObserver(measureDots)
  if (gridEl.value) dotObserver.observe(gridEl.value)
})
onBeforeUnmount(() => dotObserver?.disconnect())
</script>

<template>
  <section>
    <div class="flex items-center gap-2 mb-3">
      <button
        class="btn px-2"
        :class="{ 'opacity-30 pointer-events-none': !canGoBack }"
        :disabled="!canGoBack"
        title="Previous month"
        @click="emit('change-month', -1)"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M8.5 3L4.5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <h2 class="flex-1 text-center text-sm font-medium text-[#e0e0e0] select-none">{{ monthLabel }}</h2>
      <button
        class="btn px-2"
        :class="{ 'opacity-30 pointer-events-none': !canGoOn }"
        :disabled="!canGoOn"
        title="Next month"
        @click="emit('change-month', 1)"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button v-if="todayButton" class="btn" @click="emit('today')">Today</button>
      <slot name="actions" />
    </div>

    <div ref="gridEl" class="grid grid-cols-7 gap-1">
      <div v-for="w in weekdays" :key="w" class="text-[11px] text-[#444] text-center pb-1 select-none">{{ w }}</div>
      <button
        v-for="key in grid"
        :key="key"
        class="h-14 sm:h-16 rounded-md border p-1.5 flex flex-col items-start text-left transition-colors min-w-0"
        :class="[
          key === selected
            ? 'border-[#6366f1] bg-[#1a1a2e]/60'
            : key.startsWith(monthPrefix)
              ? 'border-[#161616] bg-[#0a0a0a] hover:border-[#333]'
              : 'border-transparent hover:border-[#1f1f1f]',
        ]"
        :title="longDay(key)"
        @click="emit('pick', key)"
      >
        <span
          class="text-xs leading-none"
          :class="key === today
            ? 'text-[#818cf8] font-semibold'
            : key.startsWith(monthPrefix) ? 'text-[#aaa]' : 'text-[#333]'"
        >
          {{ Number(key.slice(8)) }}
        </span>
        <!-- One dot per task. When they do not all fit: "+3" = 3 more tasks -->
        <span data-dots class="flex-1 min-h-0 w-full overflow-hidden flex flex-wrap content-start gap-[3px] mt-1.5">
          <span
            v-for="(t, i) in dotsOf(key).dots"
            :key="i"
            class="w-1.5 h-1.5 shrink-0 rounded-full"
            :class="dotClass(t)"
          />
          <span
            v-if="dotsOf(key).more"
            class="h-1.5 shrink-0 text-[9px] leading-[6px] font-medium text-[#888] whitespace-nowrap"
            :style="{ width: `${dotsOf(key).moreWidth}px` }"
          >+{{ dotsOf(key).more }}</span>
        </span>
      </button>
    </div>

    <div class="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-[#555] select-none">
      <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />Done</span>
      <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#ef4444]" />Not done (day is over)</span>
      <span class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-[#4a4a4a]" />Not done yet</span>
    </div>
    <div class="mt-2 text-xs text-[#555]">
      This month: <span class="text-[#22c55e]">{{ monthStats.done }} done</span>
      · <span :class="monthStats.notDone ? 'text-[#ef4444]' : ''">{{ monthStats.notDone }} not done</span>
      · <span :class="monthStats.toDo ? 'text-[#999]' : ''">{{ monthStats.toDo }} to do</span>
      <span v-if="loading" class="ml-2 text-[#333]">Loading…</span>
    </div>
    <p v-if="error" class="mt-2 text-xs text-[#ef4444]">{{ error }}</p>
  </section>
</template>
