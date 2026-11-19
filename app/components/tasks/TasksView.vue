<script setup lang="ts">
import { CheckIcon, ExternalLinkIcon, LinkIcon, Trash2Icon, XIcon } from '@lucide/vue'
import type { Task } from '~/types/tasks'

// Daily tasks: a month calendar (left) and the tasks of the chosen day (right).
// On small screens the list goes under the calendar.
// Tasks are made in notes (the "Today's task" button). Their text is changed in the note.
const { tasksVersion, tasksChanged } = usePendingTasks()

const today = ref(todayKey())
const selected = ref(today.value)
const shown = ref({ year: new Date().getFullYear(), month: new Date().getMonth() })
const shownMonth = computed(() => `${shown.value.year}-${String(shown.value.month + 1).padStart(2, '0')}`)

// The 6 weeks the calendar shows (tasks/Calendar.vue): load the tasks of all of them.
const grid = computed(() => monthGrid(shown.value.year, shown.value.month))

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

// "Share": a view-only link to the tasks of some months (tasks/ShareDialog.vue).
const shareOpen = ref(false)

function isPending(t: Task) {
  return taskState(t, today.value) === 'late'
}

/** "Open note" opens the note in a new tab, at the task's line. */
function noteLink(t: Task) {
  return `/note/${encodeURIComponent(t.docId!)}?task=${encodeURIComponent(t.id)}`
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
  const wasCancelled = t.cancelled
  // Show it right away. Done takes the cancel off.
  t.done = done
  if (done) t.cancelled = false
  actionError.value = ''
  notice.value = null
  try {
    const body = done ? { done, doneDay: todayKey() } : { done }
    Object.assign(t, await $fetch<Task>(`/api/tasks/${t.id}`, { method: 'PUT', body }))
    void tasksChanged() // the note ticks its checklist line too
  } catch {
    t.done = !done
    t.cancelled = wasCancelled
    actionError.value = 'Could not save. Try again.'
  }
}

/** Cancel a task (you decided not to do it; it stays in your history), or undo that. */
async function setCancelled(t: Task, cancelled: boolean) {
  if (busyId.value) return
  busyId.value = t.id
  actionError.value = ''
  notice.value = null
  datePickId.value = null
  try {
    Object.assign(t, await $fetch<Task>(`/api/tasks/${t.id}`, { method: 'PUT', body: { cancelled } }))
    void tasksChanged() // the tag in the note and the pending list change too
  } catch {
    actionError.value = cancelled ? 'Could not cancel the task. Try again.' : 'Could not undo. Try again.'
  } finally {
    busyId.value = null
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

// ---- Select many: mark done, cancel or delete together ----
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

async function bulk(action: 'done' | 'cancel' | 'delete') {
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
    await $fetch('/api/tasks/bulk', { method: 'POST', body: { ids: list.map((t) => t.id), action, doneDay: todayKey() } })
    stopSelect()
    await tasksChanged()
  } catch {
    actionError.value = action === 'done'
      ? 'Could not mark them done. Try again.'
      : action === 'cancel' ? 'Could not cancel them. Try again.' : 'Could not remove them. Try again.'
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
      <TasksCalendar
        class="lg:flex-[1.4] min-w-0"
        :year="shown.year"
        :month="shown.month"
        :today="today"
        :selected="selected"
        :tasks="tasks"
        :loading="loading"
        :error="error"
        today-button
        @pick="pickDay"
        @change-month="changeMonth"
        @today="goToday"
      >
        <template #actions>
          <button class="btn" title="Share your tasks of some months with a view-only link" @click="shareOpen = true">
            <LinkIcon :size="15" />
            Share
          </button>
        </template>
      </TasksCalendar>

      <!-- Tasks of the chosen day -->
      <section class="lg:flex-1 min-w-0 w-full self-start rounded-xl border border-[#1f1f1f] bg-[#080808] p-4">
        <div class="flex items-start gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h3 class="text-sm font-medium text-[#e0e0e0]">{{ longDay(selected) }}</h3>
              <span v-if="selected === today" class="text-2xs px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#818cf8] border border-[#6366f1]/30">Today</span>
            </div>
            <div class="text-xs text-[#555] mt-0.5">
              {{ dayTasks.length ? doneText(dayTasks) : 'No tasks for this day.' }}
            </div>
          </div>
          <button v-if="dayTasks.length && !selecting" class="btn btn-sm shrink-0" @click="startSelect">Select</button>
        </div>

        <!-- Select many -->
        <div v-if="selecting" class="flex flex-wrap items-center gap-1.5 mt-3 p-2 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b]">
          <button class="btn btn-sm" @click="togglePickAll">{{ allPicked ? 'Select none' : 'Select all' }}</button>
          <span class="text-2xs text-[#666] px-1">{{ pickedTasks.length }} selected</span>
          <div class="flex-1" />
          <button
            class="btn btn-sm btn-accent"
            :class="{ 'opacity-40 pointer-events-none': !pickedTasks.length || bulkBusy }"
            @click="bulk('done')"
          >
            Mark done ({{ pickedTasks.length }})
          </button>
          <button
            class="btn btn-sm"
            title="You decided not to do them. They stay in your history."
            :class="{ 'opacity-40 pointer-events-none': !pickedTasks.length || bulkBusy }"
            @click="bulk('cancel')"
          >
            Mark cancelled ({{ pickedTasks.length }})
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
              <CheckIcon v-if="picked.has(t.id)" :size="13" :stroke-width="3" />
            </button>
            <button
              v-else
              class="mt-0.5 w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center transition-colors"
              :class="t.done
                ? 'bg-[#22c55e]/15 border-[#22c55e]/60 text-[#22c55e]'
                : t.cancelled
                  ? 'bg-[#f59e0b]/10 border-[#f59e0b]/50 text-[#f59e0b] hover:border-[#6366f1]'
                  : 'border-[#333] hover:border-[#6366f1]'"
              :title="t.done ? 'Mark as not done' : t.cancelled ? 'Cancelled. Click to mark as done' : 'Mark as done'"
              @click="toggleDone(t)"
            >
              <CheckIcon v-if="t.done" :size="13" :stroke-width="3" />
              <XIcon v-else-if="t.cancelled" :size="13" :stroke-width="3" />
            </button>

            <div class="flex-1 min-w-0">
              <div
                class="text-sm break-words"
                :class="!t.text ? 'italic text-[#555]' : t.done || t.cancelled ? 'line-through text-[#555]' : 'text-[#ddd]'"
              >
                {{ t.text || 'Empty line' }}
              </div>

              <!-- Small facts about the task. "Completed in 3 days (10 Nov → 12 Nov)" already says the first day. -->
              <div
                v-if="isPending(t) || t.cancelled || t.movedFrom || completedText(t)"
                class="text-2xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
              >
                <span v-if="isPending(t)" class="text-[#ef4444]">Not done</span>
                <span v-if="t.cancelled" class="text-[#f59e0b]">Cancelled</span>
                <span v-if="completedText(t)" class="text-[#22c55e]/80">{{ completedText(t) }}</span>
                <span v-else-if="t.movedFrom" class="text-[#555]">from {{ shortDay(t.movedFrom) }}</span>
              </div>

              <!-- Buttons: move or cancel a task that is not done, and open its note -->
              <div
                v-if="!selecting && (!t.done || t.docId)"
                class="flex flex-wrap items-center gap-1.5 mt-1.5"
                :class="{ 'opacity-50 pointer-events-none': busyId === t.id }"
              >
                <button
                  v-if="t.cancelled"
                  class="btn btn-sm"
                  title="Make it a task to do again"
                  @click="setCancelled(t, false)"
                >
                  Undo cancel
                </button>
                <template v-else-if="!t.done">
                  <button v-if="isPending(t)" class="btn btn-sm btn-accent" @click="moveTo(t, today)">Move to today</button>
                  <button v-else class="btn btn-sm" title="Move to the next day" @click="moveTo(t, addDays(t.day, 1))">Next day</button>
                  <button class="btn btn-sm" title="Move to another day" @click="openDatePick(t)">Pick a date</button>
                  <button
                    class="btn btn-sm"
                    title="You decided not to do it. It stays in your history."
                    @click="setCancelled(t, true)"
                  >
                    Cancel task
                  </button>
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
                  <ExternalLinkIcon :size="13" />
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
              <Trash2Icon :size="15" />
            </button>
          </li>
        </ul>

        <p v-if="selected === today && dayTasks.length && !selecting" class="mt-3 pt-3 border-t border-[#141414] text-2xs text-[#444]">
          Add more from your notes with the <span class="text-[#818cf8]">Today's task</span> button.
        </p>
      </section>
    </div>

    <TasksShareDialog :open="shareOpen" :month="shownMonth" @close="shareOpen = false" />
  </div>
</template>
