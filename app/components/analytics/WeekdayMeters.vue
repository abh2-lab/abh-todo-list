<script setup lang="ts">
import type { WeekdayRow } from '~/utils/taskStats'

// "Monday to Sunday": the done rate of the tasks planned on each day of the week.
// "Best" marks the day that goes best. The bars grow when the box comes on the screen.
defineProps<{ rows: WeekdayRow[] }>()
</script>

<template>
  <ul class="space-y-3">
    <li
      v-for="(r, i) in rows"
      :key="r.longName"
      class="grid grid-cols-[4.75rem_1fr_5.5rem] items-center gap-3"
      :title="`${r.longName}: ${r.counts.done} of ${r.counts.done + r.counts.late} tasks done`"
    >
      <span class="flex items-center gap-1.5 text-xs text-[#ccc]">
        {{ r.name }}
        <span v-if="r.best" class="text-2xs leading-none px-1.5 py-0.5 rounded bg-[#1a1a2e] text-[#a5b4fc] border border-[#6366f1]/30">Best</span>
      </span>
      <span class="h-2 rounded-full bg-[#6366f1]/15 overflow-hidden">
        <span
          v-if="r.rate"
          class="block h-full rounded-full bg-[#6366f1] an-anim an-grow-x"
          :style="{ width: `${r.rate * 100}%`, animationDelay: `${i * 60}ms` }"
        />
      </span>
      <span class="text-right whitespace-nowrap">
        <span class="text-xs font-semibold text-[#f0f0f0]">{{ percent(r.rate) }}</span>
        <span class="ml-1.5 text-2xs text-[#666] tabular-nums">{{ r.counts.done }}/{{ r.counts.done + r.counts.late }}</span>
      </span>
    </li>
  </ul>
</template>
