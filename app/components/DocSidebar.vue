<script setup lang="ts">
interface DocMeta {
  id: string
  title: string
  updatedAt: string | Date
}

const props = defineProps<{
  docs: DocMeta[]
  activeId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
  'new-doc': []
  close: []
}>()

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

function handleDelete(e: MouseEvent, id: string) {
  e.stopPropagation()
  if (confirm('Delete this document? This cannot be undone.')) {
    emit('delete', id)
  }
}
</script>

<template>
  <aside class="flex flex-col w-60 bg-[#080808] border-r border-[#1f1f1f] shadow-2xl shadow-black">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#161616] shrink-0">
      <span class="text-xs font-semibold text-[#444] uppercase tracking-widest select-none">All Notes</span>
      <button
        class="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-[#111] hover:bg-[#1a1a1a] text-[#777] hover:text-[#f0f0f0] border border-[#1f1f1f] transition-colors"
        title="New document"
        @click="emit('new-doc')"
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        New
      </button>
    </div>

    <!-- Doc list -->
    <div class="flex-1 overflow-y-auto py-1.5">
      <div v-if="docs.length === 0" class="px-4 py-8 text-sm text-[#333] text-center select-none leading-relaxed">
        No documents yet.<br/>Click New to create one.
      </div>

      <div
        v-for="doc in docs"
        :key="doc.id"
        role="button"
        tabindex="0"
        class="group relative flex items-center gap-2.5 w-full px-4 py-2.5 cursor-pointer transition-colors"
        :class="doc.id === activeId ? 'bg-[#111]' : 'hover:bg-[#0d0d0d]'"
        @click="emit('select', doc.id); emit('close')"
        @keydown.enter="emit('select', doc.id); emit('close')"
      >
        <!-- Active bar -->
        <div
          class="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-full transition-colors"
          :class="doc.id === activeId ? 'bg-[#6366f1]' : 'bg-transparent'"
        />

        <!-- Doc icon -->
        <svg
          class="w-3.5 h-3.5 shrink-0 transition-colors mt-0.5"
          :class="doc.id === activeId ? 'text-[#6366f1]' : 'text-[#333] group-hover:text-[#555]'"
          viewBox="0 0 14 14" fill="none"
        >
          <path d="M2.5 2h6l3 3v7h-9V2z" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
          <path d="M8.5 2v3h3" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round"/>
        </svg>

        <!-- Title + date -->
        <div class="flex-1 min-w-0">
          <div
            class="text-sm truncate leading-snug transition-colors"
            :class="doc.id === activeId ? 'text-[#f0f0f0] font-medium' : 'text-[#888] group-hover:text-[#ccc]'"
          >
            {{ doc.title || 'Untitled' }}
          </div>
          <div class="text-xs text-[#333] mt-0.5 group-hover:text-[#444] transition-colors">
            {{ relativeTime(doc.updatedAt) }}
          </div>
        </div>

        <!-- Delete -->
        <button
          class="w-6 h-6 flex items-center justify-center rounded text-[#333] hover:text-[#ef4444] hover:bg-[#1a0808] opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Delete"
          @click.stop="handleDelete($event, doc.id)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 2h8M3 2V1.5a.5.5 0 011 0V2M2.5 2l.5 7h3.5l.5-7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>
