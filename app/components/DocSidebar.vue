<script setup lang="ts">
import type { DocMeta } from '~/types/docs'

const props = defineProps<{
  docs: DocMeta[]
  activeId: string | null
  /** Logged in: show two groups, "My notes" and "Public notes". */
  loggedIn?: boolean
  /** Wider panel (phone menu). */
  wide?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
  'new-doc': [opts: { private?: boolean }]
  close: []
}>()

interface Group {
  key: string
  label: string | null
  hint: string
  docs: DocMeta[]
  /** Show a + button to make a new note in this group. */
  addPublic: boolean
  empty: string
}

const groups = computed<Group[]>(() => {
  if (!props.loggedIn) {
    return [{ key: 'all', label: null, hint: '', docs: props.docs, addPublic: false, empty: '' }]
  }
  return [
    {
      key: 'mine',
      label: 'My notes',
      hint: 'only you',
      docs: props.docs.filter((d) => d.isPrivate),
      addPublic: false,
      empty: 'No private notes yet. Click New to make one.',
    },
    {
      key: 'public',
      label: 'Public notes',
      hint: 'everyone',
      docs: props.docs.filter((d) => !d.isPrivate),
      addPublic: true,
      empty: 'No public notes.',
    },
  ]
})

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
  <aside
    class="flex flex-col bg-[#080808] border-r border-[#1f1f1f] shadow-2xl shadow-black"
    :class="wide ? 'w-72 max-w-[85vw]' : 'w-60'"
  >
    <!-- Phone: who is logged in + the parts of the app -->
    <slot name="top" />

    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#161616] shrink-0">
      <span class="text-xs font-semibold text-[#444] uppercase tracking-widest select-none">All Notes</span>
      <button
        class="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded bg-[#111] hover:bg-[#1a1a1a] text-[#777] hover:text-[#f0f0f0] border border-[#1f1f1f] transition-colors"
        :title="loggedIn ? 'New private note' : 'New document'"
        @click="emit('new-doc', { private: true })"
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        New
      </button>
    </div>

    <!-- Doc list -->
    <div class="flex-1 overflow-y-auto py-1.5">
      <div v-if="docs.length === 0 && !loggedIn" class="px-4 py-8 text-sm text-[#333] text-center select-none leading-relaxed">
        No documents yet.<br/>Click New to create one.
      </div>

      <template v-for="group in groups" :key="group.key">
        <div v-if="group.label" class="flex items-center justify-between pl-4 pr-3 pt-3 pb-1.5">
          <span class="text-[11px] text-[#555] select-none">
            <span class="font-semibold uppercase tracking-wider">{{ group.label }}</span>
            <span class="text-[#333]"> · {{ group.hint }}</span>
          </span>
          <button
            v-if="group.addPublic"
            class="w-6 h-6 flex items-center justify-center rounded text-[#555] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
            title="New public note (everyone can see and edit it)"
            @click="emit('new-doc', { private: false })"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M4.5 1v7M1 4.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div v-if="group.label && group.docs.length === 0" class="px-4 py-2 text-xs text-[#333] select-none">
          {{ group.empty }}
        </div>

        <div
          v-for="doc in group.docs"
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

          <!-- Icon: lock = private, page = public -->
          <svg
            v-if="doc.isPrivate"
            class="w-3.5 h-3.5 shrink-0 transition-colors mt-0.5"
            :class="doc.id === activeId ? 'text-[#6366f1]' : 'text-[#333] group-hover:text-[#555]'"
            viewBox="0 0 14 14" fill="none"
          >
            <rect x="3" y="6.25" width="8" height="5.75" rx="1" stroke="currentColor" stroke-width="1.1"/>
            <path d="M4.75 6.25V4.5a2.25 2.25 0 014.5 0v1.75" stroke="currentColor" stroke-width="1.1"/>
          </svg>
          <svg
            v-else
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
              {{ relativeTime(doc.updatedAt) }}<span v-if="doc.isPrivate && doc.shared"> · shared link on</span>
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
      </template>
    </div>
  </aside>
</template>
