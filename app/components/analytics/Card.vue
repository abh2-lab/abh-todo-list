<script setup lang="ts">
import { ChartColumnIcon, TableIcon } from '@lucide/vue'

// One box on the analytics page. It slides in the first time it comes on the screen,
// and then its chart starts to grow (the slot gets `shown`).
// With a "table" slot, a button shows the same numbers as a table instead of the chart.
defineProps<{ title?: string; note?: string }>()
const slots = defineSlots<{
  default(props: { shown: boolean }): unknown
  table?(): unknown
}>()

const el = ref<HTMLElement | null>(null)
const shown = useRevealOnScroll(el)
const asTable = ref(false)
</script>

<template>
  <section
    ref="el"
    class="an-reveal min-w-0 rounded-xl border border-[#1f1f1f] bg-[#080808] p-4 sm:p-5"
    :class="{ 'is-shown': shown }"
  >
    <div v-if="title" class="flex items-start gap-3 mb-4">
      <div class="flex-1 min-w-0">
        <h2 class="text-sm font-medium text-[#e5e5e5]">{{ title }}</h2>
        <p v-if="note" class="text-2xs text-[#777] mt-0.5">{{ note }}</p>
      </div>
      <button
        v-if="slots.table"
        class="btn btn-sm btn-ghost shrink-0 -mt-1 -mr-1.5"
        :aria-pressed="asTable"
        @click="asTable = !asTable"
      >
        <ChartColumnIcon v-if="asTable" :size="14" />
        <TableIcon v-else :size="14" />
        {{ asTable ? 'Chart' : 'Table' }}
      </button>
    </div>
    <div v-if="asTable && slots.table" class="overflow-x-auto">
      <slot name="table" />
    </div>
    <slot v-else :shown="shown" />
  </section>
</template>
