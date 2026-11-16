<script setup lang="ts">
import { CheckIcon } from '@lucide/vue'
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
      <CheckIcon v-if="task.done" :size="13" :stroke-width="3" />
    </span>
    <div class="flex-1 min-w-0">
      <div
        class="text-sm break-words"
        :class="!task.text ? 'italic text-[#555]' : task.done ? 'line-through text-[#555]' : 'text-[#ddd]'"
      >
        {{ task.text || 'Empty line' }}
      </div>
      <div v-if="overdue || task.movedFrom" class="text-2xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span v-if="overdue" class="text-[#ef4444]">Not done</span>
        <span v-if="task.movedFrom" class="text-[#555]">from {{ shortDay(task.movedFrom) }}</span>
      </div>
    </div>
  </li>
</template>
