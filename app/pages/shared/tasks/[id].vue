<script setup lang="ts">
import type { SharedTask, SharedTasks } from '~/types/tasks'

// The page behind a Daily tasks share link: someone's tasks of some months, view only.
// Pick a month and click a day to see its tasks, or see all of them in one list.
// It loads again every minute (and when you come back to the tab), so new tasks and ticks show up.
const route = useRoute()
const id = String(route.params.id ?? '')

const data = ref<SharedTasks | null>(null)
const failed = ref<'gone' | 'network' | null>(null)
const loading = ref(true)

const today = ref(todayKey())
const tab = ref<'calendar' | 'list'>('calendar')
const shown = ref({ year: new Date().getFullYear(), month: new Date().getMonth() })
const selected = ref(today.value)
const shownKey = computed(() => `${shown.value.year}-${String(shown.value.month + 1).padStart(2, '0')}`)

const title = computed(() => (data.value?.name ? `${data.value.name}'s daily tasks` : 'Daily tasks'))
const rangeText = computed(() => (data.value ? monthRange(data.value.from, data.value.to, 'long') : ''))

useHead(() => ({
  title: title.value,
  // A private link: search engines should not list it.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
}))

/** The shared months, like ["2026-09", "2026-10", …]. */
const months = computed(() => {
  if (!data.value) return []
  const [y, m] = data.value.from.split('-').map(Number)
  return Array.from({ length: monthCount(data.value.from, data.value.to) }, (_, i) =>
    toMonthKey(new Date(y!, m! - 1 + i, 1)))
})

const inRange = (day: string) => !!data.value && day.slice(0, 7) >= data.value.from && day.slice(0, 7) <= data.value.to
const todayInRange = computed(() => inRange(today.value))

const tasks = computed(() => data.value?.tasks ?? [])
const byDay = computed(() => {
  const map = new Map<string, SharedTask[]>()
  for (const t of tasks.value) {
    const list = map.get(t.day)
    if (list) list.push(t)
    else map.set(t.day, [t])
  }
  return map
})
const dayTasks = computed(() => byDay.value.get(selected.value) ?? [])

/** All tasks, month by month, day by day. */
const allByMonth = computed(() => months.value.map((month) => {
  const days = [...byDay.value.entries()]
    .filter(([day]) => day.startsWith(month))
    .map(([day, list]) => ({ day, list }))
  return { month, days, all: days.flatMap((d) => d.list) }
}))

function showMonth(key: string) {
  const [y, m] = key.split('-').map(Number)
  shown.value = { year: y!, month: m! - 1 }
}

function pickDay(day: string) {
  // The calendar also shows a few days of the months around it; only the shared months can be opened.
  if (!inRange(day)) return
  selected.value = day
  if (day.slice(0, 7) !== shownKey.value) showMonth(day.slice(0, 7))
}

function changeMonth(step: number) {
  const key = toMonthKey(new Date(shown.value.year, shown.value.month + step, 1))
  if (inRange(`${key}-01`)) showMonth(key)
}

function goToday() {
  today.value = todayKey()
  pickDay(today.value)
}

/** "All tasks": click a day to see it in the calendar. */
function openDay(day: string) {
  tab.value = 'calendar'
  pickDay(day)
}

async function load(first = false) {
  try {
    const res = await $fetch<SharedTasks>(`/api/shared-tasks/${encodeURIComponent(id)}`)
    data.value = res
    failed.value = null
    if (first) {
      // Start on today when it is in the shared months; otherwise on the first shared month.
      const start = inRange(today.value) ? today.value : `${res.from}-01`
      selected.value = start
      showMonth(start.slice(0, 7))
    }
  } catch (e) {
    if (errorStatus(e) === 404) {
      data.value = null
      failed.value = 'gone'
    } else if (!data.value) {
      failed.value = 'network'
    }
  } finally {
    loading.value = false
  }
}

let timer: ReturnType<typeof setInterval> | null = null
function onVisible() {
  if (document.visibilityState !== 'visible') return
  today.value = todayKey()
  void load()
}
onMounted(() => {
  void load(true)
  timer = setInterval(() => {
    today.value = todayKey()
    if (document.visibilityState === 'visible' && failed.value !== 'gone') void load()
  }, 60_000)
  document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  document.removeEventListener('visibilitychange', onVisible)
})

function retry() {
  loading.value = true
  failed.value = null
  void load(true)
}
</script>

<template>
  <div class="min-h-screen bg-black text-[#ddd]">
    <header class="border-b border-[#1f1f1f] px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 class="text-base text-[#f0f0f0]">{{ title }}</h1>
      <span v-if="data" class="text-xs text-[#777]">{{ rangeText }}</span>
      <span class="text-2xs px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#6366f1] border border-[#6366f1]/30 font-medium">
        View only
      </span>
    </header>

    <div v-if="loading" class="py-24 text-center text-sm text-[#333] select-none">Loading…</div>

    <div v-else-if="failed === 'gone'" class="py-24 px-6 flex flex-col items-center gap-2 text-center">
      <div class="text-sm text-[#888]">This link does not work any more.</div>
      <div class="text-xs text-[#555]">The person who shared it may have stopped sharing.</div>
    </div>

    <div v-else-if="failed === 'network' || !data" class="py-24 px-6 flex flex-col items-center gap-3 text-center">
      <div class="text-sm text-[#888]">Could not load the tasks. Check your connection and try again.</div>
      <button class="btn" @click="retry">Try again</button>
    </div>

    <div v-else class="max-w-6xl mx-auto px-4 py-5 sm:px-6">
      <!-- Calendar or one list; the shared months -->
      <div class="flex flex-wrap items-center gap-2 mb-5">
        <div class="flex rounded border border-[#1f1f1f] overflow-hidden text-xs" role="tablist">
          <button
            role="tab"
            :aria-selected="tab === 'calendar'"
            class="px-3 py-1.5 transition-colors"
            :class="tab === 'calendar' ? 'bg-[#1a1a2e] text-[#a5b4fc]' : 'bg-[#111] text-[#888] hover:text-[#f0f0f0]'"
            @click="tab = 'calendar'"
          >
            Calendar
          </button>
          <button
            role="tab"
            :aria-selected="tab === 'list'"
            class="px-3 py-1.5 border-l border-[#1f1f1f] transition-colors"
            :class="tab === 'list' ? 'bg-[#1a1a2e] text-[#a5b4fc]' : 'bg-[#111] text-[#888] hover:text-[#f0f0f0]'"
            @click="tab = 'list'"
          >
            All tasks
          </button>
        </div>
        <div v-if="tab === 'calendar' && months.length > 1" class="flex flex-wrap gap-1.5">
          <button
            v-for="m in months"
            :key="m"
            class="btn btn-sm"
            :class="{ 'btn-accent': m === shownKey }"
            @click="showMonth(m)"
          >
            {{ monthName(m) }}
          </button>
        </div>
      </div>

      <!-- Calendar: click a day to see its tasks -->
      <div v-if="tab === 'calendar'" class="flex flex-col lg:flex-row gap-6">
        <TasksCalendar
          class="lg:flex-[1.4] min-w-0"
          :year="shown.year"
          :month="shown.month"
          :today="today"
          :selected="selected"
          :tasks="tasks"
          :min="data.from"
          :max="data.to"
          :today-button="todayInRange"
          @pick="pickDay"
          @change-month="changeMonth"
          @today="goToday"
        />

        <section class="lg:flex-1 min-w-0 w-full self-start rounded-xl border border-[#1f1f1f] bg-[#080808] p-4">
          <div class="flex items-center gap-2">
            <h3 class="text-sm font-medium text-[#e0e0e0]">{{ longDay(selected) }}</h3>
            <span v-if="selected === today" class="text-2xs px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#818cf8] border border-[#6366f1]/30">Today</span>
          </div>
          <div class="text-xs text-[#555] mt-0.5">
            {{ dayTasks.length ? doneText(dayTasks) : 'No tasks for this day.' }}
          </div>
          <ul class="mt-3">
            <TasksSharedTaskItem v-for="(t, i) in dayTasks" :key="i" :task="t" :today="today" />
          </ul>
        </section>
      </div>

      <!-- All tasks of the shared months -->
      <div v-else class="max-w-2xl">
        <section v-for="m in allByMonth" :key="m.month" class="mb-8">
          <div class="flex items-baseline gap-3 border-b border-[#1f1f1f] pb-2">
            <h2 class="text-sm font-medium text-[#e0e0e0]">{{ monthName(m.month, 'long') }}</h2>
            <span class="text-xs text-[#555]">
              {{ m.all.length ? doneText(m.all) : 'No tasks' }}
            </span>
          </div>
          <div v-for="d in m.days" :key="d.day" class="mt-4">
            <button
              class="text-xs text-[#a5b4fc] hover:text-[#c7d2fe] hover:underline underline-offset-2"
              title="Show this day in the calendar"
              @click="openDay(d.day)"
            >
              {{ longDay(d.day) }}
            </button>
            <span class="ml-2 text-2xs text-[#555]">{{ doneText(d.list) }}</span>
            <ul class="mt-1">
              <TasksSharedTaskItem v-for="(t, i) in d.list" :key="i" :task="t" :today="today" />
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
