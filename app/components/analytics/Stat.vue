<script setup lang="ts">
// One number on the analytics page, like "Best streak: 6 days".
// The number counts up when its box comes on the screen.
withDefaults(defineProps<{
  label: string
  /** Null: nothing to show yet ("–"). */
  value: number | null
  decimals?: number
  unit?: string
  sub?: string
}>(), { decimals: 0, unit: '', sub: '' })
</script>

<template>
  <AnalyticsCard v-slot="{ shown }">
    <div class="text-2xs text-[#888]">{{ label }}</div>
    <div class="mt-2 text-[28px] leading-none font-semibold text-[#f0f0f0]">
      <template v-if="value !== null">
        <AnalyticsCountUp :value="value" :decimals="decimals" :play="shown" /><span
          v-if="unit"
          class="text-sm font-normal text-[#999]"
          :class="{ 'ml-1': unit !== '%' }"
        >{{ unit }}</span>
      </template>
      <span v-else class="text-[#555]">–</span>
    </div>
    <div v-if="sub" class="mt-2 text-2xs text-[#777]">{{ sub }}</div>
  </AnalyticsCard>
</template>
