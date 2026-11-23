<script setup lang="ts">
import { Undo2Icon, XIcon } from '@lucide/vue'
import type { BoardNotice } from '~/composables/useBoardNotice'

// The short message at the bottom of a board (useBoardNotice), with Undo after deleting.
defineProps<{ notice: BoardNotice | null; canUndo: boolean }>()
const emit = defineEmits<{ undo: []; close: [] }>()
</script>

<template>
  <div
    v-if="notice"
    class="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pl-4 pr-2 py-2 rounded-lg border shadow-2xl shadow-black text-sm"
    :class="notice.error ? 'border-[#7f1d1d] bg-[#1a0b0b] text-[#fca5a5]' : 'border-[#1f1f1f] bg-[#0b0b0b] text-[#ccc]'"
    role="status"
  >
    <span>{{ notice.text }}</span>
    <button v-if="notice.undo && canUndo" class="btn btn-sm" @click="emit('undo')">
      <Undo2Icon :size="14" />
      Undo
    </button>
    <button class="btn btn-ghost btn-sm !px-1.5" title="Close" @click="emit('close')">
      <XIcon :size="14" />
    </button>
  </div>
</template>
