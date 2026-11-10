<script setup lang="ts">
import type { DocMeta } from '~/types/docs'

// One note in the sidebar list.
defineProps<{ doc: DocMeta; active: boolean }>()
const emit = defineEmits<{ select: []; delete: [] }>()

function relativeTime(date: string | Date) {
  const d = typeof date === 'string' ? new Date(date) : date
  const diff = Date.now() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString()
}
</script>

<template>
  <div
    role="button"
    tabindex="0"
    class="group relative flex items-center gap-2.5 w-full px-4 py-2.5 cursor-pointer transition-colors"
    :class="active ? 'bg-[#111]' : 'hover:bg-[#0d0d0d]'"
    @click="emit('select')"
    @keydown.enter="emit('select')"
  >
    <!-- Active bar -->
    <div
      class="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full transition-colors"
      :class="active ? 'bg-[#6366f1]' : 'bg-transparent'"
    />

    <!-- Icon: lock = private, page = public -->
    <svg
      v-if="doc.isPrivate"
      class="w-3.5 h-3.5 shrink-0 transition-colors mt-0.5"
      :class="active ? 'text-[#6366f1]' : 'text-[#333] group-hover:text-[#555]'"
      viewBox="0 0 14 14" fill="none"
    >
      <rect x="3" y="6.25" width="8" height="5.75" rx="1" stroke="currentColor" stroke-width="1.1"/>
      <path d="M4.75 6.25V4.5a2.25 2.25 0 014.5 0v1.75" stroke="currentColor" stroke-width="1.1"/>
    </svg>
    <svg
      v-else
      class="w-3.5 h-3.5 shrink-0 transition-colors mt-0.5"
      :class="active ? 'text-[#6366f1]' : 'text-[#333] group-hover:text-[#555]'"
      viewBox="0 0 14 14" fill="none"
    >
      <path d="M2.5 2h6l3 3v7h-9V2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M8.5 2v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
    </svg>

    <!-- Title + date -->
    <div class="flex-1 min-w-0">
      <div
        class="text-sm truncate leading-snug transition-colors"
        :class="active ? 'text-[#f0f0f0] font-medium' : 'text-[#888] group-hover:text-[#ccc]'"
      >
        {{ doc.title || 'Untitled' }}
      </div>
      <div class="text-xs text-[#333] mt-0.5 group-hover:text-[#444] transition-colors">
        {{ relativeTime(doc.updatedAt) }}<span v-if="doc.isPrivate && doc.shared"> · shared link on</span>
      </div>
    </div>

    <!-- Delete -->
    <button
      class="w-6 h-6 flex items-center justify-center rounded text-[#333] hover:text-[#ef4444] hover:bg-[#1a0808] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shrink-0"
      title="Delete"
      @click.stop="emit('delete')"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
        <path d="M1 2h8M3 2V1.5a.5.5 0 011 0V2M2.5 2l.5 7h3.5l.5-7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </button>
  </div>
</template>
