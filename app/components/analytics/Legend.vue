<script setup lang="ts">
// The names of the four task colors, for the charts that show all of them.
</script>

<template>
  <div class="flex flex-wrap gap-x-4 gap-y-1 text-2xs text-[#888] select-none">
    <span v-for="s in STATES" :key="s" class="flex items-center gap-1.5">
      <span class="w-2.5 h-2.5 rounded-sm" :style="{ background: STATE_COLOR[s] }" />
      {{ STATE_NAME[s] }}
    </span>
  </div>
</template>
