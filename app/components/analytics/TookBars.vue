<script setup lang="ts">
import type { LongTask } from '~/utils/taskStats'

// "How long tasks took": the done tasks by the days they took (1 day = done on the planned day),
// and the tasks that took the longest. The bars grow when the box comes on the screen.
const props = defineProps<{ groups: { name: string; count: number }[]; longest: LongTask[] }>()

// One color, lighter for longer (the order of the groups shows in the color too)
const RAMP = ['#4f46e5', '#6366f1', '#818cf8', '#a5b4fc']
const max = computed(() => Math.max(1, ...props.groups.map((g) => g.count)))
const total = computed(() => props.groups.reduce((sum, g) => sum + g.count, 0))
const share = (n: number) => (total.value ? Math.round((n / total.value) * 100) : 0)
</script>

<template>
  <div class="grid gap-6 md:grid-cols-2 md:gap-8">
    <ul class="space-y-3.5">
      <li v-for="(g, i) in groups" :key="g.name" class="grid grid-cols-[4.5rem_1fr] items-center gap-3">
        <span class="text-xs text-[#ccc]">{{ g.name }}</span>
        <span class="flex items-center gap-2 min-w-0">
          <span
            v-if="g.count"
            class="h-4 rounded-r an-anim an-grow-x"
            :style="{ width: `calc((100% - 5.5rem) * ${g.count / max})`, background: RAMP[i], animationDelay: `${i * 90}ms` }"
          />
          <span class="whitespace-nowrap">
            <span class="text-xs font-semibold text-[#f0f0f0]">{{ g.count }}</span>
            <span class="ml-1 text-2xs text-[#666]">{{ share(g.count) }}%</span>
          </span>
        </span>
      </li>
    </ul>

    <div class="min-w-0">
      <h3 class="text-xs text-[#999] mb-1">Took the longest</h3>
      <ol v-if="longest.length">
        <li v-for="(t, i) in longest" :key="i" class="py-2 border-t border-[#141414] first:border-t-0">
          <div class="text-sm truncate" :class="t.text ? 'text-[#ddd]' : 'italic text-[#555]'" :title="t.text">
            {{ t.text || 'Empty line' }}
          </div>
          <div class="text-2xs text-[#777] mt-0.5">
            <span class="text-[#bbb]">{{ t.days }} days</span> · {{ dayMonth(t.start) }} → {{ dayMonth(t.end) }}
          </div>
        </li>
      </ol>
      <p v-else class="text-xs text-[#666] py-2">Every done task was done on its planned day.</p>
    </div>
  </div>
</template>
