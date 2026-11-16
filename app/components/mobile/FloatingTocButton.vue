<script setup lang="ts">
import { TableOfContentsIcon } from '@lucide/vue'
defineEmits<{
  click: []
}>()
</script>

<template>
  <button
    class="fixed right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-[#111] border border-[#1f1f1f] text-[#f0f0f0] opacity-50 hover:opacity-100 active:opacity-100 transition-opacity shadow-lg flex items-center justify-center"
    title="Show outline"
    @click="$emit('click')"
  >
    <TableOfContentsIcon :size="20" />
  </button>
</template>
