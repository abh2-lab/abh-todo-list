<script setup lang="ts">
import type { MonthRow } from '~/utils/taskStats'

// "Month by month": the tasks of each shared month on the same scale, split into
// done / not done / cancelled / still to do, with the numbers and the done rate written out.
const props = defineProps<{ rows: MonthRow[] }>()

const max = computed(() => Math.max(1, ...props.rows.map((r) => r.counts.total)))
const parts = (r: MonthRow) => STATES.filter((s) => r.counts[s] > 0)
</script>

<template>
  <ul class="space-y-5">
    <li v-for="(r, i) in rows" :key="r.month">
      <div class="flex items-baseline justify-between gap-3 mb-1.5">
        <span class="text-xs text-[#ddd]">{{ monthName(r.month, 'long') }}</span>
        <span class="whitespace-nowrap">
          <span class="text-sm font-semibold text-[#f0f0f0]">{{ percent(r.rate) }}</span>
          <span class="ml-1 text-2xs text-[#777]">done rate</span>
        </span>
      </div>
      <div
        v-if="r.counts.total"
        class="flex h-3.5 gap-[2px] an-anim an-grow-x"
        :style="{ width: `${(r.counts.total / max) * 100}%`, animationDelay: `${i * 120}ms` }"
      >
        <span
          v-for="s in parts(r)"
          :key="s"
          class="h-full min-w-[2px] last:rounded-r"
          :style="{ flex: `${r.counts[s]} 1 0`, background: STATE_COLOR[s] }"
        />
      </div>
      <div v-else class="h-3.5 rounded bg-[#111]" />
      <div class="mt-1.5 text-2xs text-[#777]">
        {{ r.counts.done }} done · {{ r.counts.late }} not done · {{ r.counts.cancelled }} cancelled ·
        {{ r.counts.todo }} still to do · {{ plural(r.counts.total, 'task') }} in all
      </div>
    </li>
  </ul>
</template>
