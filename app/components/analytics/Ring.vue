<script setup lang="ts">
import { useId } from 'vue'
import type { TaskState } from '~/utils/taskStatus'
import type { Counts } from '~/utils/taskStats'

// The ring of all tasks: done, not done, cancelled and still to do, with the number of tasks in
// the middle. It fills up when it comes on the screen. Point at a part, or at its name in the
// list, to see its number in the middle.
const props = defineProps<{ counts: Counts; play: boolean }>()

const SIZE = 172
const STROKE = 18
const R = (SIZE - STROKE) / 2 - 2
const C = 2 * Math.PI * R
const GAP = 2 // the gap between two parts, along the ring
const MID = SIZE / 2
const maskId = `ring-${useId().replace(/[^\w-]/g, '')}`

const active = ref<TaskState | null>(null)
const root = ref<HTMLElement | null>(null)

// The mouse leaves: show all tasks again. With a finger the part stays lit until a tap somewhere else.
function leave(e: PointerEvent) {
  if (e.pointerType !== 'touch') active.value = null
}
function onDocDown(e: PointerEvent) {
  if (active.value && root.value && !root.value.contains(e.target as Node)) active.value = null
}
onMounted(() => document.addEventListener('pointerdown', onDocDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown))

const parts = computed(() => {
  const total = props.counts.total
  if (!total) return []
  const present = STATES.filter((s) => props.counts[s] > 0)
  const gap = present.length > 1 ? GAP : 0
  let start = 0
  return present.map((state) => {
    const len = (props.counts[state] / total) * C
    const part = { state, dash: Math.max(1, len - gap), offset: -(start + gap / 2) }
    start += len
    return part
  })
})

const share = (s: TaskState) => (props.counts.total ? Math.round((props.counts[s] / props.counts.total) * 100) : 0)
</script>

<template>
  <div ref="root" class="flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
    <div class="relative shrink-0" :style="{ width: `${SIZE}px`, height: `${SIZE}px` }">
      <svg :width="SIZE" :height="SIZE" :viewBox="`0 0 ${SIZE} ${SIZE}`" aria-hidden="true">
        <defs>
          <!-- Draws the ring from the top, all the way round -->
          <mask :id="maskId">
            <circle
              :cx="MID"
              :cy="MID"
              :r="R"
              fill="none"
              stroke="#fff"
              :stroke-width="STROKE + 6"
              :stroke-dasharray="C"
              :transform="`rotate(-90 ${MID} ${MID})`"
              class="an-anim an-sweep"
              :style="{ '--len': C }"
            />
          </mask>
        </defs>
        <circle :cx="MID" :cy="MID" :r="R" fill="none" stroke="#141414" :stroke-width="STROKE" />
        <g :mask="`url(#${maskId})`">
          <circle
            v-for="p in parts"
            :key="p.state"
            :cx="MID"
            :cy="MID"
            :r="R"
            fill="none"
            :stroke="STATE_COLOR[p.state]"
            :stroke-width="STROKE"
            :stroke-dasharray="`${p.dash} ${C}`"
            :stroke-dashoffset="p.offset"
            :transform="`rotate(-90 ${MID} ${MID})`"
            class="transition-opacity duration-150"
            :style="{ opacity: active && active !== p.state ? 0.25 : 1 }"
            @pointerenter="active = p.state"
            @pointerleave="leave"
          />
        </g>
      </svg>
      <!-- In the middle: all tasks, or the part pointed at -->
      <div class="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <template v-if="active">
          <span class="text-[34px] leading-none font-semibold text-[#f5f5f5]">{{ counts[active] }}</span>
          <span class="mt-1.5 text-2xs text-[#999]">{{ STATE_NAME[active] }} · {{ share(active) }}%</span>
        </template>
        <template v-else>
          <span class="text-[34px] leading-none font-semibold text-[#f5f5f5]">
            <AnalyticsCountUp :value="counts.total" :play="play" />
          </span>
          <span class="mt-1.5 text-2xs text-[#999]">{{ counts.total === 1 ? 'task' : 'tasks' }}</span>
        </template>
      </div>
    </div>

    <!-- The parts, with their numbers (point at one to light it up in the ring) -->
    <ul class="w-full sm:w-auto sm:min-w-[15rem] sm:max-w-[22rem] flex-1">
      <li v-for="s in STATES" :key="s">
        <button
          type="button"
          class="w-full flex items-center gap-3 py-2 px-2 -mx-2 rounded-md text-left transition-colors hover:bg-[#111] focus-visible:bg-[#111] outline-none"
          :class="{ 'opacity-40': active && active !== s }"
          @pointerenter="active = s"
          @pointerleave="leave"
          @focus="active = s"
          @blur="active = null"
        >
          <span class="w-3 h-3 rounded-sm shrink-0" :style="{ background: STATE_COLOR[s] }" />
          <span class="flex-1 text-xs text-[#ccc]">{{ STATE_NAME[s] }}</span>
          <span class="text-sm font-semibold text-[#f0f0f0] tabular-nums">
            <AnalyticsCountUp :value="counts[s]" :play="play" />
          </span>
          <span class="w-10 text-right text-2xs text-[#777] tabular-nums">{{ share(s) }}%</span>
        </button>
      </li>
    </ul>
  </div>
</template>
