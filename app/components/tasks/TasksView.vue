<script setup lang="ts">
import type { Task } from '~/types/tasks'

// Daily tasks: a month calendar (left) and the tasks of the chosen day (right).
// On small screens the list goes under the calendar.
const { tasksVersion, refreshPending } = usePendingTasks()

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
// A task was changed somewhere else (for example in the pending popup).
watch(tasksVersion, load)

// Keep "today" right when the app stays open past midnight.
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  load()
  timer = setInterval(() => { today.value = todayKey() }, 60_000)
})
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

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

// ---- Add, tick, edit, move, delete ----
const newText = ref('')
const adding = ref(false)
const actionError = ref('')

async function addTask() {
  const text = newText.value.trim()
  if (!text) {
    actionError.value = 'Write the task first.'
    return
  }
  if (adding.value) return
  adding.value = true
  actionError.value = ''
  try {
    const task = await $fetch<Task>('/api/tasks', { method: 'POST', body: { text, day: selected.value } })
    tasks.value.push(task)
    newText.value = ''
    if (task.day < today.value) refreshPending()
  } catch {
    actionError.value = 'Could not add the task. Try again.'
  } finally {
    adding.value = false
  }
}

async function toggleDone(t: Task) {
  const done = !t.done
  t.done = done // show it right away
  try {
    Object.assign(t, await $fetch<Task>(`/api/tasks/${t.id}`, { method: 'PUT', body: { done } }))
    refreshPending()
  } catch {
    t.done = !done
    actionError.value = 'Could not save. Try again.'
  }
}

async function moveToToday(t: Task) {
  try {
    Object.assign(t, await $fetch<Task>(`/api/tasks/${t.id}`, { method: 'PUT', body: { day: todayKey() } }))
    refreshPending()
  } catch {
    actionError.value = 'Could not move the task. Try again.'
  }
}

async function removeTask(t: Task) {
  if (!confirm('Delete this task?')) return
  try {
    await $fetch(`/api/tasks/${t.id}`, { method: 'DELETE' })
    tasks.value = tasks.value.filter((x) => x.id !== t.id)
    refreshPending()
  } catch {
    actionError.value = 'Could not delete the task. Try again.'
  }
}

const editingId = ref<string | null>(null)
const editText = ref('')

function startEdit(t: Task) {
  editingId.value = t.id
  editText.value = t.text
}

async function saveEdit(t: Task) {
  if (editingId.value !== t.id) return
  editingId.value = null
  const text = editText.value.trim()
  if (!text || text === t.text) return
  const old = t.text
  t.text = text
  try {
    await $fetch(`/api/tasks/${t.id}`, { method: 'PUT', body: { text } })
  } catch {
    t.text = old
    actionError.value = 'Could not save. Try again.'
  }
}

function focusInput(el: unknown) {
  if (el instanceof HTMLInputElement && document.activeElement !== el) el.focus()
}
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

        <div class="grid grid-cols-7 gap-1">
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
            <span class="flex flex-wrap gap-[3px] mt-1.5">
              <span
                v-for="t in (byDay.get(key) ?? []).slice(0, 8)"
                :key="t.id"
                class="w-1.5 h-1.5 rounded-full"
                :class="dotClass(t)"
              />
              <span v-if="(byDay.get(key)?.length ?? 0) > 8" class="text-[9px] leading-[6px] text-[#555]">+</span>
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
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-medium text-[#e0e0e0]">{{ longDay(selected) }}</h3>
          <span v-if="selected === today" class="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#818cf8] border border-[#6366f1]/30">Today</span>
        </div>
        <div class="text-xs text-[#555] mt-0.5 mb-3">
          {{ dayTasks.length ? `${dayDone} of ${dayTasks.length} done` : 'No tasks for this day yet.' }}
        </div>

        <form class="flex gap-2" @submit.prevent="addTask">
          <input
            v-model="newText"
            maxlength="500"
            placeholder="Add a task"
            class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#444] outline-none focus:border-[#6366f1] transition-colors"
            @input="actionError = ''"
          />
          <button type="submit" class="btn btn-accent" :class="{ 'opacity-60': adding }">Add</button>
        </form>
        <p v-if="actionError" class="mt-2 text-xs text-[#ef4444]">{{ actionError }}</p>

        <ul class="mt-3">
          <li
            v-for="t in dayTasks"
            :key="t.id"
            class="group flex items-start gap-2.5 py-2.5 border-t border-[#141414]"
          >
            <button
              class="mt-0.5 w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center transition-colors"
              :class="t.done ? 'bg-[#22c55e]/15 border-[#22c55e]/60 text-[#22c55e]' : 'border-[#333] hover:border-[#6366f1]'"
              :title="t.done ? 'Mark as not done' : 'Mark as done'"
              @click="toggleDone(t)"
            >
              <svg v-if="t.done" width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>

            <div class="flex-1 min-w-0">
              <input
                v-if="editingId === t.id"
                :ref="focusInput"
                v-model="editText"
                maxlength="500"
                class="w-full bg-transparent border-b border-[#6366f1] text-sm text-[#f0f0f0] outline-none"
                @keydown.enter.prevent="saveEdit(t)"
                @keydown.esc="editingId = null"
                @blur="saveEdit(t)"
              />
              <button
                v-else
                class="block w-full text-left text-sm break-words"
                :class="t.done ? 'line-through text-[#555]' : 'text-[#ddd]'"
                title="Click to change the text"
                @click="startEdit(t)"
              >
                {{ t.text }}
              </button>
              <div v-if="isPending(t) || t.movedFrom" class="text-[11px] mt-0.5 flex gap-2">
                <span v-if="isPending(t)" class="text-[#ef4444]">Not done</span>
                <span v-if="t.movedFrom" class="text-[#555]">from {{ shortDay(t.movedFrom) }}</span>
              </div>
            </div>

            <button v-if="isPending(t)" class="btn shrink-0" @click="moveToToday(t)">Move to today</button>
            <button
              class="w-7 h-7 flex items-center justify-center rounded text-[#444] hover:text-[#ef4444] hover:bg-[#1a0808] transition-colors shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
              title="Delete task"
              @click="removeTask(t)"
            >
              <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M1 2h8M3 2V1.5a.5.5 0 011 0V2M2.5 2l.5 7h3.5l.5-7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
