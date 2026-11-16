<script setup lang="ts">
import type { TaskState } from '~/utils/taskStatus'
import type { DayGroup, GroupSize } from '~/utils/taskStats'

// "Each day": one bar per day (per 7 days, or per month, for long links), split into
// done / not done / cancelled / still to do. The bars grow when the box comes on the screen.
// Hover or tap a bar to see its numbers; the arrow keys go from bar to bar too.
const props = defineProps<{ groups: DayGroup[]; size: GroupSize; label: string }>()

const box = ref<HTMLElement | null>(null)
const width = useBoxWidth(box)

const TOP = 10
const PLOT_H = 190
const AXIS_H = 26
const LEFT = 30
const GAP = 2
const HEIGHT = TOP + PLOT_H + AXIS_H
const BASE = TOP + PLOT_H

const ticks = computed(() => axisTicks(Math.max(1, ...props.groups.map((g) => g.counts.total))))
const yMax = computed(() => ticks.value[ticks.value.length - 1]!)
const y = (v: number) => BASE - (v / yMax.value) * PLOT_H

const slotW = computed(() => Math.max(0, width.value - LEFT) / Math.max(1, props.groups.length))
// Thin bars (24px at most) with air between them
const barW = computed(() => Math.max(2, Math.min(24, slotW.value * 0.72, slotW.value - GAP)))
const center = (i: number) => LEFT + (i + 0.5) * slotW.value

const bars = computed(() => props.groups.map((g, i) => {
  const x = center(i) - barW.value / 2
  const present = STATES.filter((s) => g.counts[s] > 0)
  const segs: { state: TaskState; d: string }[] = []
  let below = 0
  present.forEach((state, k) => {
    const last = k === present.length - 1
    // A 2px gap between two parts of a bar: half from each
    const bottom = y(below) - (k ? GAP / 2 : 0)
    below += g.counts[state]
    const top = y(below) + (last ? 0 : GAP / 2)
    const h = Math.max(1, bottom - top)
    segs.push({ state, d: last ? barTopPath(x, bottom - h, barW.value, h) : boxPath(x, bottom - h, barW.value, h) })
  })
  return { key: g.first, segs }
}))

const stagger = computed(() => Math.min(22, 450 / Math.max(1, props.groups.length)))

// Labels under the bars: as many as fit
function axisName(g: DayGroup) {
  return props.size === 'month' ? monthName(g.first.slice(0, 7)) : dayMonth(g.first)
}
const labels = computed(() => {
  const room = props.size === 'month' ? 64 : 52
  const every = Math.max(1, Math.ceil(room / Math.max(1, slotW.value)))
  return props.groups.flatMap((g, i) => {
    const x = center(i)
    if (i % every || x - room / 2 < 0 || x + room / 2 > width.value + 4) return []
    return [{ key: g.first, x, text: axisName(g) }]
  })
})

const { active, onPointer, onLeave, onKey, onBlur } = useChartCursor(
  box,
  () => props.groups.length,
  (x) => {
    const i = Math.floor((x - LEFT) / Math.max(1, slotW.value))
    return i >= 0 && i < props.groups.length ? i : null
  },
)

const tip = computed(() => {
  const g = active.value === null ? null : props.groups[active.value]
  if (!g) return null
  return {
    x: center(active.value!),
    title: `${groupName(g, props.size)} · ${plural(g.counts.total, 'task')}`,
    rows: STATES.map((s) => ({ color: STATE_COLOR[s], value: String(g.counts[s]), label: STATE_NAME[s], dim: !g.counts[s] })),
  }
})
const spoken = computed(() =>
  tip.value ? `${tip.value.title}: ${tip.value.rows.map((r) => `${r.value} ${r.label.toLowerCase()}`).join(', ')}` : '')
</script>

<template>
  <div
    ref="box"
    class="relative select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#6366f1]/60"
    tabindex="0"
    role="group"
    :aria-label="`${label}. Use the left and right arrow keys to read each bar, or show the table.`"
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
          :x2="width"
          :y1="crisp(y(t))"
          :y2="crisp(y(t))"
          :stroke="t === 0 ? '#2e2e2e' : '#171717'"
        />
        <text
          v-for="t in ticks"
          :key="`n${t}`"
          :x="LEFT - 8"
          :y="y(t)"
          text-anchor="end"
          dominant-baseline="middle"
          class="fill-[#666] text-[12px] tabular-nums"
        >{{ t }}</text>
      </g>
      <g
        v-for="(b, i) in bars"
        :key="b.key"
        class="an-anim an-grow-y transition-opacity duration-150"
        :style="{ animationDelay: `${Math.round(i * stagger)}ms`, opacity: active === null || active === i ? 1 : 0.35 }"
      >
        <path v-for="s in b.segs" :key="s.state" :d="s.d" :fill="STATE_COLOR[s.state]" />
      </g>
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
