<script setup lang="ts">
import { ArrowLeftIcon } from '@lucide/vue'

// The analytics page of a Daily tasks share link: numbers and charts of the shared tasks.
// View only and no login, like the share page; it stops working when the owner stops sharing,
// and it never shows notes. Pick all months or one month. It loads again every minute.
const route = useRoute()
const id = String(route.params.id ?? '')
const { data, failed, loading, today, months, retry } = useSharedTasks(id)

const tasksLink = `/shared/tasks/${encodeURIComponent(id)}`
const title = computed(() => (data.value?.name ? `${data.value.name}'s task analytics` : 'Task analytics'))
const rangeText = computed(() => (data.value ? monthRange(data.value.from, data.value.to, 'long') : ''))

useHead(() => ({
  title: title.value,
  // A private link: search engines should not list it.
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
}))

/** The months to count: 'all', or one month like "2026-11". */
const scope = ref('all')
watch(months, (list) => {
  if (scope.value !== 'all' && !list.includes(scope.value)) scope.value = 'all'
})
const scopeName = computed(() => (scope.value === 'all' ? rangeText.value : monthName(scope.value, 'long')))

const stats = computed(() => {
  if (!data.value) return null
  const from = scope.value === 'all' ? data.value.from : scope.value
  const to = scope.value === 'all' ? data.value.to : scope.value
  return taskStats(data.value.tasks, from, to, today.value)
})

// Month by month: only when all months are shown, and there are two or more
const monthList = computed(() =>
  data.value && scope.value === 'all' && months.value.length > 1 ? monthRows(data.value.tasks, months.value, today.value) : [])

const rateLine = computed(() => {
  const s = stats.value
  if (!s) return ''
  if (s.rate === null) return s.counts.todo ? 'No task\'s day is over yet.' : 'No done or not-done tasks to count.'
  return `${s.counts.done} of ${plural(s.counts.done + s.counts.late, 'task')} done`
})

const onTimeSub = computed(() => {
  const s = stats.value!
  const done = s.counts.done
  return done ? `${s.onTime} of ${plural(done, 'done task')}` : 'No done tasks yet'
})
const longerSub = computed(() => {
  const s = stats.value!
  if (s.longer) return `on average · ${plural(s.longer, 'task')} took more than 1 day`
  return s.counts.done ? 'Every done task was done on its planned day' : 'No done tasks yet'
})
const streakSub = computed(() => {
  const st = stats.value!.streak
  if (!st) return 'No task done yet'
  return st.days > 1 ? `in a row with a task done · ${dayMonth(st.first)} – ${dayMonth(st.last)}` : `with a task done · ${dayMonth(st.first)}`
})

const groupTitle = computed(() => ({ day: 'Each day', week: 'Each week', month: 'Each month' })[stats.value!.size])
const groupNote = computed(() => ({
  day: 'The tasks planned for each day.',
  week: 'The tasks planned in each 7 days (days 1–7, 8–14, and so on).',
  month: 'The tasks planned in each month.',
})[stats.value!.size])

// The same numbers as the charts, as tables
const groupTable = computed(() => {
  const s = stats.value!
  return {
    columns: [{ day: 'Day', week: 'Week', month: 'Month' }[s.size], 'Done', 'Not done', 'Cancelled', 'Still to do', 'All'],
    rows: s.groups
      .filter((g) => g.counts.total)
      .map((g) => [groupName(g, s.size), g.counts.done, g.counts.late, g.counts.cancelled, g.counts.todo, g.counts.total]),
  }
})
const weekTable = computed(() => ({
  columns: ['Week', 'Done', 'Not done', 'Done rate'],
  rows: stats.value!.weeks.map((w) => [groupName(w, 'week'), w.counts.done, w.counts.late, percent(w.rate)]),
}))
const monthTable = computed(() => ({
  columns: ['Month', 'Done', 'Not done', 'Cancelled', 'Still to do', 'All', 'Done rate'],
  rows: monthList.value.map((m) => [monthName(m.month), m.counts.done, m.counts.late, m.counts.cancelled, m.counts.todo, m.counts.total, percent(m.rate)]),
}))
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

    <div v-else-if="failed === 'network' || !data || !stats" class="py-24 px-6 flex flex-col items-center gap-3 text-center">
      <div class="text-sm text-[#888]">Could not load the tasks. Check your connection and try again.</div>
      <button class="btn" @click="retry">Try again</button>
    </div>

    <main v-else class="max-w-6xl mx-auto px-4 py-5 sm:px-6">
      <!-- Back to the tasks, and the months to count -->
      <div class="flex flex-wrap items-center gap-2 mb-5">
        <NuxtLink :to="tasksLink" class="btn">
          <ArrowLeftIcon :size="15" />
          Back to tasks
        </NuxtLink>
        <div v-if="months.length > 1" class="flex flex-wrap gap-1.5" role="group" aria-label="Months to count">
          <button
            class="btn btn-sm"
            :class="{ 'btn-accent': scope === 'all' }"
            :aria-pressed="scope === 'all'"
            @click="scope = 'all'"
          >
            All months
          </button>
          <button
            v-for="m in months"
            :key="m"
            class="btn btn-sm"
            :class="{ 'btn-accent': scope === m }"
            :aria-pressed="scope === m"
            @click="scope = m"
          >
            {{ monthName(m) }}
          </button>
        </div>
        <span class="ml-auto text-2xs text-[#555]">Updates every minute</span>
      </div>

      <div v-if="!stats.counts.total" class="rounded-xl border border-[#1f1f1f] bg-[#080808] py-16 px-6 text-center">
        <div class="text-sm text-[#888]">No tasks in {{ scopeName }}.</div>
        <div class="text-xs text-[#555] mt-1">The numbers and charts show up when there are tasks.</div>
      </div>

      <!-- A new month picked: everything comes in again -->
      <div v-else :key="scope" class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-5">
          <AnalyticsCard
            class="lg:col-span-3"
            title="All tasks"
            :note="`The tasks planned in ${scopeName}.`"
          >
            <template #default="{ shown }">
              <AnalyticsRing :counts="stats.counts" :play="shown" />
            </template>
          </AnalyticsCard>

          <AnalyticsCard
            class="lg:col-span-2"
            title="Done rate"
            note="Done tasks out of done + not done. Cancelled tasks and tasks still to do are not counted."
          >
            <template #default="{ shown }">
              <div class="text-[56px] leading-none font-semibold tracking-tight text-[#f5f5f5]">
                <template v-if="stats.rate !== null">
                  <AnalyticsCountUp :value="Math.round(stats.rate * 100)" :play="shown" />%
                </template>
                <span v-else class="text-[#555]">–</span>
              </div>
              <p class="mt-3 text-xs text-[#999]">{{ rateLine }}</p>
              <template v-if="stats.rate !== null">
                <div class="mt-5 flex h-2 gap-[2px] an-anim an-grow-x" style="animation-delay: 150ms">
                  <span
                    v-if="stats.counts.done"
                    class="h-full first:rounded-l-full last:rounded-r-full bg-[#22c55e]"
                    :style="{ flex: `${stats.counts.done} 1 0` }"
                  />
                  <span
                    v-if="stats.counts.late"
                    class="h-full first:rounded-l-full last:rounded-r-full bg-[#ef4444]"
                    :style="{ flex: `${stats.counts.late} 1 0` }"
                  />
                </div>
                <div class="mt-2 flex justify-between gap-3 text-2xs text-[#888]">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#22c55e]" />{{ stats.counts.done }} done</span>
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-[#ef4444]" />{{ stats.counts.late }} not done</span>
                </div>
              </template>
            </template>
          </AnalyticsCard>
        </div>

        <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <AnalyticsStat
            label="Done on the planned day"
            :value="stats.counts.done ? Math.round((stats.onTime / stats.counts.done) * 100) : null"
            unit="%"
            :sub="onTimeSub"
          />
          <AnalyticsStat
            label="Tasks that took longer"
            :value="stats.longerAverage === null ? null : Math.round(stats.longerAverage * 10) / 10"
            :decimals="1"
            unit="days"
            :sub="longerSub"
          />
          <AnalyticsStat
            label="Best streak"
            :value="stats.streak?.days ?? null"
            :unit="stats.streak?.days === 1 ? 'day' : 'days'"
            :sub="streakSub"
          />
          <AnalyticsStat
            label="Busiest day"
            :value="stats.busiest?.done ?? null"
            :unit="stats.busiest?.done === 1 ? 'task done' : 'tasks done'"
            :sub="stats.busiest ? shortDay(stats.busiest.day) : 'No task done yet'"
          />
        </div>

        <AnalyticsCard :title="groupTitle" :note="groupNote">
          <AnalyticsLegend class="mb-3" />
          <AnalyticsDayBars :groups="stats.groups" :size="stats.size" :label="groupTitle" />
          <template #table>
            <AnalyticsTable :columns="groupTable.columns" :rows="groupTable.rows" />
            <p class="mt-2 text-2xs text-[#555]">Days with no tasks are left out.</p>
          </template>
        </AnalyticsCard>

        <div class="grid gap-4 lg:grid-cols-2">
          <AnalyticsCard
            title="Done rate, week by week"
            note="Each point is 7 days (days 1–7, 8–14, and so on): done out of done + not done."
          >
            <AnalyticsRateLine :weeks="stats.weeks" />
            <template #table>
              <AnalyticsTable :columns="weekTable.columns" :rows="weekTable.rows" />
            </template>
          </AnalyticsCard>

          <AnalyticsCard
            title="Monday to Sunday"
            note="The done rate of the tasks planned on each day of the week."
          >
            <AnalyticsWeekdayMeters :rows="stats.weekdays" />
          </AnalyticsCard>
        </div>

        <AnalyticsCard
          title="How long tasks took"
          note="Done tasks, from the day first planned to the day done (both days count). 1 day = done on the planned day."
        >
          <AnalyticsTookBars v-if="stats.counts.done" :groups="stats.took" :longest="stats.longest" />
          <p v-else class="text-xs text-[#666]">No done tasks yet.</p>
        </AnalyticsCard>

        <AnalyticsCard
          v-if="monthList.length"
          title="Month by month"
          note="All the shared months, on the same scale."
        >
          <AnalyticsLegend class="mb-4" />
          <AnalyticsMonthBars :rows="monthList" />
          <template #table>
            <AnalyticsTable :columns="monthTable.columns" :rows="monthTable.rows" />
          </template>
        </AnalyticsCard>

        <p class="pt-2 pb-6 text-2xs text-[#555] text-center">
          Each task counts on the day it is planned for. Best streak and busiest day use the day tasks were done.
        </p>
      </div>
    </main>
  </div>
</template>
