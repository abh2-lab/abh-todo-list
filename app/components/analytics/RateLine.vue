<script setup lang="ts">
import type { DayGroup } from '~/utils/taskStats'

// "Done rate, week by week": one point for each 7 days (done out of done + not done).
// A week with nothing to count (only cancelled tasks, or tasks still to come) has no point.
// The line draws itself when the box comes on the screen. Hover or tap to see a week.
const props = defineProps<{ weeks: DayGroup[] }>()

const box = ref<HTMLElement | null>(null)
const width = useBoxWidth(box)

const TOP = 12
const PLOT_H = 160
const AXIS_H = 26
const LEFT = 40
const RIGHT = 40 // room for the number at the end of the line
const HEIGHT = TOP + PLOT_H + AXIS_H
const BASE = TOP + PLOT_H
const COLOR = '#818cf8'
const ticks = [0, 0.25, 0.5, 0.75, 1]

const slotW = computed(() => Math.max(0, width.value - LEFT - RIGHT) / Math.max(1, props.weeks.length))
const xAt = (i: number) => LEFT + (i + 0.5) * slotW.value
const yAt = (rate: number) => BASE - rate * PLOT_H

const points = computed(() => props.weeks.map((w, i) => (w.rate === null ? null : { i, x: xAt(i), y: yAt(w.rate) })))

// The line, with a break where a week has no point
const runs = computed(() => {
  const out: { i: number; x: number; y: number }[][] = []
  let run: { i: number; x: number; y: number }[] = []
  for (const p of points.value) {
    if (p) run.push(p)
    else if (run.length) { out.push(run); run = [] }
  }
  if (run.length) out.push(run)
  return out
})
const linePath = computed(() => runs.value.map((r) => r.map((p, k) => `${k ? 'L' : 'M'}${p.x},${p.y}`).join('')).join(''))
const areaPath = computed(() => runs.value
  .filter((r) => r.length > 1)
  .map((r) => `M${r[0]!.x},${BASE}${r.map((p) => `L${p.x},${p.y}`).join('')}L${r[r.length - 1]!.x},${BASE}Z`)
  .join(''))
// Dots on each week when there is room; a week alone (no line to it) always gets its dot
const dots = computed(() => runs.value.flatMap((r) => (slotW.value >= 16 || r.length === 1 ? r : [])))
const lastPoint = computed(() => [...points.value].reverse().find((p) => p) ?? null)

const labels = computed(() => {
  const room = 52
  const every = Math.max(1, Math.ceil(room / Math.max(1, slotW.value)))
  return props.weeks.flatMap((w, i) => (i % every ? [] : [{ key: w.first, x: xAt(i), text: dayMonth(w.first) }]))
})

const { active, onPointer, onLeave, onKey, onBlur } = useChartCursor(
  box,
  () => props.weeks.length,
  (x) => {
    const i = Math.floor((x - LEFT) / Math.max(1, slotW.value))
    return Math.max(0, Math.min(props.weeks.length - 1, i))
  },
)

const tip = computed(() => {
  const w = active.value === null ? null : props.weeks[active.value]
  if (!w) return null
  const counted = w.counts.done + w.counts.late
  return {
    x: xAt(active.value!),
    title: groupName(w, 'week'),
    rows: w.rate === null
      ? [{ value: '–', label: w.counts.total ? 'no done or not-done tasks' : 'no tasks' }]
      : [
          { color: COLOR, value: percent(w.rate), label: 'done rate' },
          { value: `${w.counts.done} of ${counted}`, label: 'tasks done' },
        ],
  }
})
const activePoint = computed(() => (active.value === null ? null : points.value[active.value] ?? null))
const spoken = computed(() => (tip.value ? `${tip.value.title}: ${tip.value.rows.map((r) => `${r.value} ${r.label}`).join(', ')}` : ''))
</script>

<template>
  <div
    ref="box"
    class="relative select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/60"
    tabindex="0"
    role="group"
    aria-label="Done rate, week by week. Use the left and right arrow keys to read each week, or show the table."
    @keydown="onKey"
    @blur="onBlur"
  >
    <svg
      v-if="width"
      :width="width"
      :height="HEIGHT"
      class="block touch-pan-y"
      aria-hidden="true"
      @pointermove="onPointer"
      @pointerdown="onPointer"
      @pointerleave="onLeave"
    >
      <g>
        <line
          v-for="t in ticks"
          :key="t"
          :x1="LEFT"
          :x2="width - RIGHT + 12"
          :y1="crisp(yAt(t))"
          :y2="crisp(yAt(t))"
          :stroke="t === 0 ? '#2e2e2e' : '#171717'"
        />
        <text
          v-for="t in ticks"
          :key="`n${t}`"
          :x="LEFT - 8"
          :y="yAt(t)"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-[#666] text-[12px] tabular-nums"
        >{{ t * 100 }}%</text>
      </g>
      <!-- The line that follows the mouse -->
      <line
        v-if="active !== null"
        :x1="crisp(xAt(active))"
        :x2="crisp(xAt(active))"
        :y1="TOP"
        :y2="BASE"
        stroke="#3a3a3a"
      />
      <path v-if="areaPath" :d="areaPath" :fill="COLOR" fill-opacity="0.1" class="an-anim an-fade" style="animation-delay: 350ms" />
      <path
        v-if="linePath"
        :d="linePath"
        pathLength="1"
        fill="none"
        :stroke="COLOR"
        stroke-width="2"
        stroke-linejoin="round"
        stroke-linecap="round"
        class="an-anim an-draw"
      />
      <circle
        v-for="(p, k) in dots"
        :key="p.i"
        :cx="p.x"
        :cy="p.y"
        r="4"
        :fill="COLOR"
        stroke="#080808"
        stroke-width="2"
        class="an-anim an-pop"
        :style="{ animationDelay: `${650 + k * 35}ms` }"
      />
      <circle v-if="activePoint" :cx="activePoint.x" :cy="activePoint.y" r="5.5" :fill="COLOR" stroke="#080808" stroke-width="2" />
      <!-- The last week's number, at the end of the line -->
      <text
        v-if="lastPoint"
        :x="lastPoint.x + 10"
        :y="lastPoint.y"
        dominant-baseline="middle"
        class="fill-[#d4d4d4] text-[12px] font-semibold an-anim an-fade"
        style="animation-delay: 900ms"
      >{{ percent(weeks[lastPoint.i]!.rate) }}</text>
      <text
        v-for="l in labels"
        :key="l.key"
        :x="l.x"
        :y="BASE + 18"
        text-anchor="middle"
        class="fill-[#666] text-[12px]"
      >{{ l.text }}</text>
    </svg>
    <div v-else :style="{ height: `${HEIGHT}px` }" />
    <AnalyticsTooltip v-if="tip" :x="tip.x" :y="TOP" :width="width" :title="tip.title" :rows="tip.rows" />
    <p class="sr-only" aria-live="polite">{{ spoken }}</p>
  </div>
</template>
