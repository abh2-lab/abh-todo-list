<script setup lang="ts">
import { CheckIcon, XIcon } from '@lucide/vue'
import type { SharedTask } from '~/types/tasks'

// One task on the share page (view only): done, cancelled or not, the text, and a few facts.
const props = defineProps<{
  task: SharedTask
  today: string
}>()

const state = computed(() => taskState(props.task, props.today))
const stateName = computed(() => ({ done: 'Done', cancelled: 'Cancelled', late: 'Not done', todo: 'Not done yet' })[state.value])
// "Completed in 3 days (10 Nov → 12 Nov)" for a task done on a later day than planned
const completed = computed(() => completedText(props.task))
</script>

<template>
  <li class="flex items-start gap-2.5 py-2.5 border-t border-[#141414]">
    <span
      class="mt-0.5 w-[18px] h-[18px] shrink-0 rounded border flex items-center justify-center"
      :class="{
        'bg-[#22c55e]/15 border-[#22c55e]/60 text-[#22c55e]': state === 'done',
        'bg-[#f59e0b]/10 border-[#f59e0b]/50 text-[#f59e0b]': state === 'cancelled',
        'border-[#ef4444]/50': state === 'late',
        'border-[#333]': state === 'todo',
      }"
      :title="stateName"
      role="img"
      :aria-label="stateName"
    >
      <CheckIcon v-if="state === 'done'" :size="13" :stroke-width="3" />
      <XIcon v-else-if="state === 'cancelled'" :size="13" :stroke-width="3" />
    </span>
    <div class="flex-1 min-w-0">
      <div
        class="text-sm break-words"
        :class="!task.text ? 'italic text-[#555]' : state === 'done' || state === 'cancelled' ? 'line-through text-[#555]' : 'text-[#ddd]'"
      >
        {{ task.text || 'Empty line' }}
      </div>
      <div
        v-if="state === 'late' || state === 'cancelled' || task.movedFrom || completed"
        class="text-2xs mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5"
      >
        <span v-if="state === 'late'" class="text-[#ef4444]">Not done</span>
        <span v-if="state === 'cancelled'" class="text-[#f59e0b]">Cancelled</span>
        <span v-if="completed" class="text-[#22c55e]/80">{{ completed }}</span>
        <span v-else-if="task.movedFrom" class="text-[#555]">from {{ shortDay(task.movedFrom) }}</span>
      </div>
    </div>
  </li>
</template>
