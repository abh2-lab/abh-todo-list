<script setup lang="ts">
// The small box with the numbers of the bar (or point) under the mouse or finger.
// It sits beside the spot `x` (to the right, or to the left when there is no room), inside the chart.
const props = defineProps<{
  x: number
  y: number
  /** The width of the chart box, so the box stays inside it. */
  width: number
  title: string
  rows: { color?: string; value: string; label: string; dim?: boolean }[]
}>()

const el = ref<HTMLElement | null>(null)
const ownWidth = ref(150)
const measure = () => { if (el.value) ownWidth.value = el.value.offsetWidth }
onMounted(measure)
onUpdated(measure)

const left = computed(() => {
  const gap = 14
  let l = props.x + gap
  if (l + ownWidth.value > props.width) l = props.x - gap - ownWidth.value
  return Math.max(0, Math.min(l, props.width - ownWidth.value))
})
</script>

<template>
  <div
    ref="el"
    class="absolute z-10 pointer-events-none rounded-lg border border-[#262626] bg-[#101010]/95 px-2.5 py-2 shadow-xl shadow-black"
    :style="{ left: `${left}px`, top: `${y}px` }"
  >
    <div class="text-2xs text-[#999] whitespace-nowrap mb-1">{{ title }}</div>
    <div
      v-for="r in rows"
      :key="r.label"
      class="flex items-center gap-2 text-xs leading-5 whitespace-nowrap"
      :class="{ 'opacity-40': r.dim }"
    >
      <span class="w-2.5 h-0.5 rounded-full shrink-0" :style="{ background: r.color ?? 'transparent' }" />
      <span class="min-w-[1.1rem] text-right font-semibold text-[#f5f5f5] tabular-nums">{{ r.value }}</span>
      <span class="text-[#999]">{{ r.label }}</span>
    </div>
  </div>
</template>
