<script setup lang="ts">
import type { SharedTask } from '~/types/tasks'

// One task on the share page (view only): done or not, the text, and a few facts.
const props = defineProps<{
  task: SharedTask
  today: string
}>()

const overdue = computed(() => !props.task.done && props.task.day < props.today)
</script>

<template>
  <li class="flex items-start gap-2.5 py-2.5 border-t border-[#141414]">
    <span
      class="mt-0.5 w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center"
      :class="task.done ? 'bg-[#22c55e]/15 border-[#22c55e]/60 text-[#22c55e]' : overdue ? 'border-[#ef4444]/50' : 'border-[#333]'"
      :title="task.done ? 'Done' : 'Not done'"
      role="img"
      :aria-label="task.done ? 'Done' : 'Not done'"
    >
      <svg v-if="task.done" width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
    <div class="flex-1 min-w-0">
      <div
        class="text-sm break-words"
        :class="!task.text ? 'italic text-[#555]' : task.done ? 'line-through text-[#555]' : 'text-[#ddd]'"
      >
        {{ task.text || 'Empty line' }}
      </div>
      <div v-if="overdue || task.movedFrom" class="text-[11px] mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span v-if="overdue" class="text-[#ef4444]">Not done</span>
        <span v-if="task.movedFrom" class="text-[#555]">from {{ shortDay(task.movedFrom) }}</span>
      </div>
    </div>
  </li>
</template>
