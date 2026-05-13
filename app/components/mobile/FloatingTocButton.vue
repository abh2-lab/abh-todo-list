<script setup lang="ts">
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
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <path d="M2 4h12M5 8h9M2 12h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  </button>
</template>
