<script setup lang="ts">
import type { Task } from '~/types/tasks'

// Daily tasks: a month calendar (left) and the tasks of the chosen day (right).
// On small screens the list goes under the calendar.
// Tasks are made in notes (the "Today's task" button). Their text is changed in the note.
const { tasksVersion, tasksChanged } = usePendingTasks()

const today = ref(todayKey())
const selected = ref(today.value)
const shown = ref({ year: new Date().getFullYear(), month: new Date().getMonth() })

const grid = computed(() => monthGrid(shown.value.year, shown.value.month))
const monthPrefix = computed(() => `${shown.value.year}-${String(shown.value.month + 1).padStart(2, '0')}`)
const monthLabel = computed(() =>
  new Date(shown.value.year, shown.value.month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
)
// Mon … Sun (2024-01-01 was a Monday)
const weekdays = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }),
)

const tasks = ref<Task[]>([])
const loading = ref(false)
const error = ref('')

const byDay = computed(() => {
  const map = new Map<string, Task[]>()
  for (const t of tasks.value) {
    const list = map.get(t.day)
    if (list) list.push(t)
    else map.set(t.day, [t])
  }
  return map
})

const dayTasks = computed(() => byDay.value.get(selected.value) ?? [])
const dayDone = computed(() => dayTasks.value.filter((t) => t.done).length)

const monthStats = computed(() => {
  let done = 0
  let notDone = 0
  let toDo = 0
  for (const t of tasks.value) {
    if (!t.day.startsWith(monthPrefix.value)) continue
    if (t.done) done++
    else if (t.day < today.value) notDone++
    else toDo++
  }
  return { done, notDone, toDo }
})

function isPending(t: Task) {
  return !t.done && t.day < today.value
}

/** green = done, red = not done and the day is over, grey = not done yet */
function dotClass(t: Task) {
  if (t.done) return 'bg-[#22c55e]'
  if (t.day < today.value) return 'bg-[#ef4444]'
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

interface DayDots { dots: Task[]; more: number; moreWidth: number }
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

function tookLabel(t: Task) {
  const n = tookDays(t)
  return n === null ? '' : `took ${n} ${n === 1 ? 'day' : 'days'}`
}

/** "Open note" opens the note in a new tab, at the task's line. */
function noteLink(t: Task) {
  return `/?doc=${encodeURIComponent(t.docId!)}&task=${encodeURIComponent(t.id)}`
}

let loadToken = 0
async function load() {
  const token = ++loadToken
  loading.value = true
  try {
    const list = await $fetch<Task[]>('/api/tasks', {
      query: { from: grid.value[0], to: grid.value[grid.value.length - 1] },
    })
    if (token !== loadToken) return
    tasks.value = list
    error.value = ''
  } catch {
    if (token === loadToken) error.value = 'Could not load tasks. Check your connection and try again.'
  } finally {
    if (token === loadToken) loading.value = false
  }
}

watch(grid, load)
// A task was changed somewhere else (a note, the pending popup, another tab).
watch(tasksVersion, load)

// Keep "today" right when the app stays open past midnight.
let timer: ReturnType<typeof setInterval> | null = null
// Back to this tab: tasks may have changed in a note in another tab.
function onVisible() {
  if (document.visibilityState === 'visible') {
    today.value = todayKey()
    load()
  }
}
onMounted(() => {
  load()
  timer = setInterval(() => { today.value = todayKey() }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

function pickDay(key: string) {
  selected.value = key
  const d = fromDayKey(key)
  if (d.getFullYear() !== shown.value.year || d.getMonth() !== shown.value.month) {
    shown.value = { year: d.getFullYear(), month: d.getMonth() }
  }
}

function changeMonth(step: number) {
  const d = new Date(shown.value.year, shown.value.month + step, 1)
  shown.value = { year: d.getFullYear(), month: d.getMonth() }
}

function goToday() {
  today.value = todayKey()
  pickDay(today.value)
}

// ---- Tick, move, delete ----
const actionError = ref('')
const notice = ref<{ text: string; day: string } | null>(null)
const busyId = ref<string | null>(null)

async function toggleDone(t: Task) {
  const done = !t.done
  t.done = done // show it right away
  actionError.value = ''
  notice.value = null
  try {
    Object.assign(t, await $fetch<Task>(`/api/tasks/${t.id}`, { method: 'PUT', body: { done } }))
    void tasksChanged() // the note ticks its checklist line too
  } catch {
    t.done = !done
    actionError.value = 'Could not save. Try again.'
  }
}

async function moveTo(t: Task, day: string) {
  if (busyId.value) return
  busyId.value = t.id
  actionError.value = ''
  notice.value = null
  try {
    Object.assign(t, await $fetch<Task>(`/api/tasks/${t.id}`, { method: 'PUT', body: { day } }))
    notice.value = { text: `Moved to ${shortDay(day)}.`, day }
    void tasksChanged()
  } catch {
    actionError.value = 'Could not move the task. Try again.'
  } finally {
    busyId.value = null
  }
}

// "Pick a date": a small date box under the task
const datePickId = ref<string | null>(null)
const pickedDate = ref('')
let datePickFocused: string | null = null

function openDatePick(t: Task) {
  datePickId.value = t.id
  datePickFocused = null
  pickedDate.value = addDays(t.day < today.value ? today.value : t.day, 1)
}

// Focus the date box (and open the calendar) once, when it shows.
function focusDateInput(el: unknown) {
  if (!(el instanceof HTMLInputElement) || datePickFocused === datePickId.value) return
  datePickFocused = datePickId.value
  el.focus()
  try {
    ;(el as HTMLInputElement & { showPicker?: () => void }).showPicker?.()
  } catch {
    // Some browsers only open the calendar on a click. The box is still there.
  }
}

function confirmDatePick(t: Task) {
  const day = pickedDate.value
  if (!day) return
  if (day < today.value) {
    actionError.value = 'Pick today or a later day.'
    return
  }
  datePickId.value = null
  if (day !== t.day) void moveTo(t, day)
}

async function removeTask(t: Task) {
  const ask = t.docId
    ? 'Remove this task from the list? The line stays in your note.'
    : 'Delete this task?'
  if (!confirm(ask)) return
  actionError.value = ''
  notice.value = null
  try {
    await $fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })
    tasks.value = tasks.value.filter((x) => x.id !== t.id)
    void tasksChanged()
  } catch {
    actionError.value = 'Could not remove the task. Try again.'
  }
}

// ---- Select many: mark done or delete together ----
const selecting = ref(false)
const picked = ref(new Set<string>())
const pickedTasks = computed(() => dayTasks.value.filter((t) => picked.value.has(t.id)))
const allPicked = computed(() => dayTasks.value.length > 0 && pickedTasks.value.length === dayTasks.value.length)
const bulkBusy = ref(false)

function startSelect() {
  selecting.value = true
  picked.value = new Set()
  datePickId.value = null
}

function stopSelect() {
  selecting.value = false
  picked.value = new Set()
}

function togglePick(t: Task) {
  const next = new Set(picked.value)
  if (next.has(t.id)) next.delete(t.id)
  else next.add(t.id)
  picked.value = next
}

function togglePickAll() {
  picked.value = allPicked.value ? new Set() : new Set(dayTasks.value.map((t) => t.id))
}

async function bulk(action: 'done' | 'delete') {
  const list = pickedTasks.value
  if (list.length === 0 || bulkBusy.value) return
  if (action === 'delete') {
    const n = list.length
    const lines = list.filter((t) => t.docId).length
    const ask = `Remove ${n} ${n === 1 ? 'task' : 'tasks'} from the list?`
      + (lines === 1 ? ' The line stays in your note.' : lines > 1 ? ' The lines stay in your notes.' : '')
    if (!confirm(ask)) return
  }
  bulkBusy.value = true
  actionError.value = ''
  notice.value = null
  try {
    await $fetch('/api/tasks/bulk', { method: 'POST', body: { ids: list.map((t) => t.id), action } })
    stopSelect()
    await tasksChanged()
  } catch {
    actionError.value = action === 'done' ? 'Could not mark them done. Try again.' : 'Could not remove them. Try again.'
  } finally {
    bulkBusy.value = false
  }
}

// Another day: start fresh.
watch(selected, () => {
  stopSelect()
  datePickId.value = null
  actionError.value = ''
  notice.value = null
})
</script>

<template>
  <div class="h-full overflow-y-auto bg-black">
    <div class="max-w-6xl mx-auto px-4 py-5 sm:px-6 flex flex-col lg:flex-row gap-6">
      <!-- Calendar -->
      <section class="lg:flex-[1.4] min-w-0">
        <div class="flex items-center gap-2 mb-3">
          <button class="btn px-2" title="Previous month" @click="changeMonth(-1)">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M8.5 3L4.5 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <h2 class="flex-1 text-center text-sm font-medium text-[#e0e0e0] select-none">{{ monthLabel }}</h2>
          <button class="btn px-2" title="Next month" @click="changeMonth(1)">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5.5 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="btn" @click="goToday">Today</button>
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
            @click="pickDay(key)"
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
                v-for="t in dotsOf(key).dots"
                :key="t.id"
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

      <!-- Tasks of the chosen day -->
      <section class="lg:flex-1 min-w-0 w-full self-start rounded-xl border border-[#1f1f1f] bg-[#080808] p-4">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-[#e0e0e0]">{{ longDay(selected) }}</h3>
              <span v-if="selected === today" class="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#818cf8] border border-[#6366f1]/30">Today</span>
            </div>
            <div class="text-xs text-[#555] mt-0.5">
              {{ dayTasks.length ? `${dayDone} of ${dayTasks.length} done` : 'No tasks for this day.' }}
            </div>
          </div>
          <button v-if="dayTasks.length && !selecting" class="btn btn-sm shrink-0" @click="startSelect">Select</button>
        </div>

        <!-- Select many -->
        <div v-if="selecting" class="flex flex-wrap items-center gap-1.5 mt-3 p-2 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b]">
          <button class="btn btn-sm" @click="togglePickAll">{{ allPicked ? 'Select none' : 'Select all' }}</button>
          <span class="text-[11px] text-[#666] px-1">{{ pickedTasks.length }} selected</span>
          <div class="flex-1" />
          <button
            class="btn btn-sm btn-accent"
            :class="{ 'opacity-40 pointer-events-none': !pickedTasks.length || bulkBusy }"
            @click="bulk('done')"
          >
            Mark done ({{ pickedTasks.length }})
          </button>
          <button
            class="btn btn-sm btn-danger"
            :class="{ 'opacity-40 pointer-events-none': !pickedTasks.length || bulkBusy }"
            @click="bulk('delete')"
          >
            Delete ({{ pickedTasks.length }})
          </button>
          <button class="btn btn-sm" @click="stopSelect">Cancel</button>
        </div>

        <p v-if="actionError" class="mt-2 text-xs text-[#ef4444]">{{ actionError }}</p>
        <p v-else-if="notice" class="mt-2 text-xs text-[#888]">
          {{ notice.text }}
          <button class="text-[#818cf8] hover:text-[#a5b4fc] underline underline-offset-2 ml-1" @click="pickDay(notice.day); notice = null">Show</button>
        </p>

        <!-- How to add tasks -->
        <p v-if="selected === today && !dayTasks.length" class="mt-3 text-xs text-[#666] leading-relaxed">
          To add a task: open one of your notes, put the cursor on a line, and click
          <span class="text-[#a5b4fc]">Today's task</span> in the toolbar.
        </p>

        <ul class="mt-3">
          <li
            v-for="t in dayTasks"
            :key="t.id"
            class="group flex items-start gap-2.5 py-2.5 border-t border-[#141414]"
            :class="{ 'cursor-pointer': selecting }"
            @click="selecting && togglePick(t)"
          >
            <!-- Select box (select mode) or done box -->
            <button
              v-if="selecting"
              type="button"
              class="mt-0.5 w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center transition-colors"
              :class="picked.has(t.id) ? 'bg-[#6366f1] border-[#6366f1] text-white' : 'border-[#444] hover:border-[#6366f1]'"
              role="checkbox"
              :aria-checked="picked.has(t.id)"
              :aria-label="`Select: ${t.text || 'Empty line'}`"
              @click.stop="togglePick(t)"
            >
              <svg v-if="picked.has(t.id)" width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <button
              v-else
              class="mt-0.5 w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center transition-colors"
              :class="t.done ? 'bg-[#22c55e]/15 border-[#22c55e]/60 text-[#22c55e]' : 'border-[#333] hover:border-[#6366f1]'"
              :title="t.done ? 'Mark as not done' : 'Mark as done'"
              @click="toggleDone(t)"
            >
              <svg v-if="t.done" width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>

            <div class="flex-1 min-w-0">
              <div
                class="text-sm break-words"
                :class="!t.text ? 'italic text-[#555]' : t.done ? 'line-through text-[#555]' : 'text-[#ddd]'"
              >
                {{ t.text || 'Empty line' }}
              </div>

              <!-- Small facts about the task -->
              <div
                v-if="isPending(t) || t.movedFrom || t.done"
                class="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
              >
                <span v-if="isPending(t)" class="text-[#ef4444]">Not done</span>
                <span v-if="t.movedFrom" class="text-[#555]">from {{ shortDay(t.movedFrom) }}</span>
                <span v-if="t.done" class="text-[#22c55e]/80">{{ tookLabel(t) }}</span>
              </div>

              <!-- Buttons: move a task that is not done, and open its note -->
              <div
                v-if="!selecting && (!t.done || t.docId)"
                class="flex flex-wrap items-center gap-1.5 mt-1.5"
                :class="{ 'opacity-50 pointer-events-none': busyId === t.id }"
              >
                <template v-if="!t.done">
                  <button v-if="isPending(t)" class="btn btn-sm btn-accent" @click="moveTo(t, today)">Move to today</button>
                  <button v-else class="btn btn-sm" title="Move to the next day" @click="moveTo(t, addDays(t.day, 1))">Next day</button>
                  <button class="btn btn-sm" title="Move to another day" @click="openDatePick(t)">Pick a date</button>
                </template>
                <a
                  v-if="t.docId"
                  :href="noteLink(t)"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-sm btn-ghost"
                  title="Open the note at this line (new tab)"
                >
                  Open note
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M4 2H2v6h6V6M6 2h2v2M8 2L4.5 5.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </a>
              </div>
              <div v-if="datePickId === t.id && !selecting" class="flex flex-wrap items-center gap-1.5 mt-1.5">
                <input
                  :ref="focusDateInput"
                  v-model="pickedDate"
                  type="date"
                  :min="today"
                  aria-label="New day for this task"
                  class="bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1 text-xs text-[#f0f0f0] outline-none focus:border-[#6366f1] [color-scheme:dark]"
                  @keydown.enter.prevent="confirmDatePick(t)"
                  @keydown.esc="datePickId = null"
                />
                <button class="btn btn-sm btn-accent" @click="confirmDatePick(t)">Move</button>
                <button class="btn btn-sm" @click="datePickId = null">Cancel</button>
              </div>
            </div>

            <button
              v-if="!selecting"
              class="w-7 h-7 flex items-center justify-center rounded text-[#444] hover:text-[#ef4444] hover:bg-[#1a0808] transition-colors shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
              :title="t.docId ? 'Remove from the list (the line stays in the note)' : 'Delete task'"
              @click="removeTask(t)"
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M1 2h8M3 2V1.5a.5.5 0 011 0V2M2.5 2l.5 7h3.5l.5-7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </li>
        </ul>

        <p v-if="selected === today && dayTasks.length && !selecting" class="mt-3 pt-3 border-t border-[#141414] text-[11px] text-[#444]">
          Add more from your notes with the <span class="text-[#818cf8]">Today's task</span> button.
        </p>
      </section>
    </div>
  </div>
</template>
