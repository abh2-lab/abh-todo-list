<script setup lang="ts">
import { ChevronRightIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import type { DocMeta } from '~/types/docs'

const props = defineProps<{
  docs: DocMeta[]
  activeId: string | null
  /** Logged in: "My notes" first, public notes folded at the bottom. */
  loggedIn?: boolean
  /** Wider panel (phone menu). */
  wide?: boolean
}>()

const emit = defineEmits<{
  select: [id: string]
  delete: [id: string]
  'new-doc': [opts: { private?: boolean }]
  /** The Trash button: deleted notes (read or restore them for 30 days). */
  'open-trash': []
  close: []
}>()

const myDocs = computed(() => props.docs.filter((d) => d.isPrivate))
const publicDocs = computed(() => props.docs.filter((d) => !d.isPrivate))

// Public notes are closed by default. The choice is kept while the app is open.
const publicOpen = useState('public-notes-open', () => false)
onMounted(() => {
  // The open note is a public note: show it.
  if (props.loggedIn && props.docs.some((d) => d.id === props.activeId && !d.isPrivate)) {
    publicOpen.value = true
  }
})

function pick(id: string) {
  emit('select', id)
  emit('close')
}

function handleDelete(id: string) {
  if (confirm('Move this note to the Trash? You can get it back for 30 days.')) {
    emit('delete', id)
  }
}

function openTrash() {
  emit('open-trash')
  emit('close')
}
</script>

<template>
  <aside
    class="flex flex-col bg-[#080808] border-r border-[#1f1f1f] shadow-2xl shadow-black"
    :class="wide ? 'w-72 max-w-[85vw]' : 'w-64'"
  >
    <!-- Phone: who is logged in + the parts of the app -->
    <slot name="top" />

    <!-- Header -->
    <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#161616] shrink-0">
      <span class="flex items-center gap-2 text-xs font-semibold text-[#444] uppercase tracking-widest select-none">
        <img src="/favicon.svg" alt="" width="18" height="18" class="shrink-0">
        All Notes
      </span>
      <button
        class="flex items-center gap-1.5 text-btn px-2.5 py-1.5 rounded bg-[#111] hover:bg-[#1a1a1a] text-[#777] hover:text-[#f0f0f0] border border-[#1f1f1f] transition-colors"
        :title="loggedIn ? 'New private note (named with today\'s date)' : 'New document'"
        @click="emit('new-doc', { private: true })"
      >
        <PlusIcon :size="14" />
        New
      </button>
    </div>

    <!-- Logged out: one list (all notes are public) -->
    <div v-if="!loggedIn" class="flex-1 overflow-y-auto py-1.5">
      <div v-if="docs.length === 0" class="px-4 py-8 text-sm text-[#333] text-center select-none leading-relaxed">
        No documents yet.<br/>Click New to create one.
      </div>
      <DocSidebarItem
        v-for="doc in docs"
        :key="doc.id"
        :doc="doc"
        :active="doc.id === activeId"
        @select="pick(doc.id)"
        @delete="handleDelete(doc.id)"
      />
    </div>

    <template v-else>
      <!-- My notes -->
      <div class="flex-1 min-h-0 overflow-y-auto py-1.5">
        <div class="pl-4 pr-3 pt-3 pb-1.5 text-2xs text-[#555] select-none">
          <span class="font-semibold uppercase tracking-wider">My notes</span>
          <span class="text-[#333]"> · only you</span>
        </div>
        <div v-if="myDocs.length === 0" class="px-4 py-2 text-xs text-[#333] select-none">
          No private notes yet. Click New to make one.
        </div>
        <DocSidebarItem
          v-for="doc in myDocs"
          :key="doc.id"
          :doc="doc"
          :active="doc.id === activeId"
          @select="pick(doc.id)"
          @delete="handleDelete(doc.id)"
        />
      </div>

      <!-- Public notes: at the bottom, closed by default -->
      <div
        class="shrink-0 flex flex-col min-h-0 border-t border-[#1f1f1f] bg-[#060606]"
        :class="publicOpen ? 'max-h-[55%]' : ''"
      >
        <div class="flex items-center gap-1 pl-2 pr-3 py-1.5 shrink-0">
          <button
            class="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-2xs text-[#555] hover:text-[#999] hover:bg-[#0d0d0d] transition-colors select-none"
            :aria-expanded="publicOpen"
            :title="publicOpen ? 'Hide public notes' : 'Show public notes'"
            @click="publicOpen = !publicOpen"
          >
            <ChevronRightIcon
              :size="14"
              class="shrink-0 transition-transform"
              :class="{ 'rotate-90': publicOpen }"
            />
            <span class="shrink-0 whitespace-nowrap font-semibold uppercase tracking-wider">Public notes</span>
            <span class="min-w-0 text-[#333] truncate">· everyone ({{ publicDocs.length }})</span>
          </button>
          <button
            class="w-6 h-6 flex items-center justify-center rounded text-[#555] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors shrink-0"
            title="New public note (everyone can see and edit it)"
            @click="emit('new-doc', { private: false })"
          >
            <PlusIcon :size="14" />
          </button>
        </div>

        <div v-if="publicOpen" class="min-h-0 overflow-y-auto pb-1.5">
          <div v-if="publicDocs.length === 0" class="px-4 py-2 text-xs text-[#333] select-none">
            No public notes.
          </div>
          <DocSidebarItem
            v-for="doc in publicDocs"
            :key="doc.id"
            :doc="doc"
            :active="doc.id === activeId"
            @select="pick(doc.id)"
            @delete="handleDelete(doc.id)"
          />
        </div>
      </div>
    </template>

    <!-- Trash: deleted notes stay there for 30 days -->
    <div class="shrink-0 border-t border-[#1f1f1f] bg-[#060606] pl-2 pr-3 py-1.5">
      <button
        class="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-2xs text-[#555] hover:text-[#999] hover:bg-[#0d0d0d] transition-colors select-none"
        title="Deleted notes: read or restore them for 30 days"
        @click="openTrash"
      >
        <Trash2Icon :size="14" class="shrink-0" />
        <span class="font-semibold uppercase tracking-wider">Trash</span>
      </button>
    </div>
  </aside>
</template>
