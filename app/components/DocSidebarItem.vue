<script setup lang="ts">
import { FileTextIcon, LockIcon, Trash2Icon } from '@lucide/vue'
import type { DocMeta } from '~/types/docs'

// One note in the sidebar list. Long names use up to two lines, then "…": hover a note to see its full name.
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
    :title="doc.title || 'Untitled'"
    @click="emit('select')"
    @keydown.enter="emit('select')"
  >
    <!-- Active bar -->
    <div
      class="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full transition-colors"
      :class="active ? 'bg-[#6366f1]' : 'bg-transparent'"
    />

    <!-- Icon: lock = private, page = public -->
    <LockIcon
      v-if="doc.isPrivate"
      :size="15"
      class="shrink-0 transition-colors mt-0.5"
      :class="active ? 'text-[#6366f1]' : 'text-[#333] group-hover:text-[#555]'"
    />
    <FileTextIcon
      v-else
      :size="15"
      class="shrink-0 transition-colors mt-0.5"
      :class="active ? 'text-[#6366f1]' : 'text-[#333] group-hover:text-[#555]'"
    />

    <!-- Title + date -->
    <div class="flex-1 min-w-0">
      <div
        class="text-sm line-clamp-2 break-words leading-snug transition-colors"
        :class="active ? 'text-[#f0f0f0] font-medium' : 'text-[#888] group-hover:text-[#ccc]'"
      >
        {{ doc.title || 'Untitled' }}
      </div>
      <div class="text-xs text-[#333] mt-0.5 group-hover:text-[#444] transition-colors">
        {{ relativeTime(doc.updatedAt) }}<span v-if="doc.isPrivate && doc.shared"> · shared link on</span>
      </div>
    </div>

    <!-- Delete (moves the note to the Trash). With a mouse it shows on hover; on phones and tablets always. -->
    <button
      class="note-delete w-6 h-6 flex items-center justify-center rounded text-[#333] hover:text-[#ef4444] hover:bg-[#1a0808] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shrink-0"
      title="Move to Trash"
      @click.stop="emit('delete')"
    >
      <Trash2Icon :size="14" />
    </button>
  </div>
</template>

<style scoped>
/* Phones and tablets have no mouse to hover with, so the delete button always shows there:
   a little brighter, and bigger so it is easy to tap. (Its icon stays in the same place.) */
@media (hover: none) {
  .note-delete {
    opacity: 1;
    width: 2.25rem;
    height: 2.25rem;
    margin-right: -0.375rem;
    color: #555;
  }
}
</style>
