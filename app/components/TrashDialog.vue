<script setup lang="ts">
import { ArrowLeftIcon, FileTextIcon, LockIcon, RotateCcwIcon, Trash2Icon } from '@lucide/vue'
import type { DocMeta, FullTrashedDoc, TrashedDoc } from '~/types/docs'

// The Trash: deleted notes stay here for 30 days, then the server deletes them for good.
// Here you can read them (view only) and restore them. There is no "delete forever".
// Public notes in the Trash: everyone sees them (and can restore them). Private notes: only you.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  close: []
  /** A note is back in the notes list. */
  restored: [doc: DocMeta]
  /** "Open it" after a restore. */
  'open-note': [id: string]
}>()

const { loggedIn } = useUserSession()

const items = ref<TrashedDoc[]>([])
const loading = ref(false)
const loadFailed = ref(false)
// The note being read (view only). null = the list.
const reading = ref<FullTrashedDoc | null>(null)
const busyId = ref<string | null>(null)
const error = ref('')
// After a restore: "“Note” is back in the notes list." with "Open it".
const restoredDoc = ref<{ id: string; title: string } | null>(null)

// Logged in: your private notes first, then the public ones. Logged out: only public notes.
const sections = computed(() => {
  if (!loggedIn.value) return [{ key: 'all', name: '', who: '', list: items.value }]
  return [
    { key: 'mine', name: 'My notes', who: 'only you', list: items.value.filter((d) => d.isPrivate) },
    { key: 'public', name: 'Public notes', who: 'everyone', list: items.value.filter((d) => !d.isPrivate) },
  ].filter((s) => s.list.length > 0)
})

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    items.value = await $fetch<TrashedDoc[]>('/api/trash')
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

/** Open a note to read it (view only). */
async function read(d: TrashedDoc) {
  busyId.value = d.id
  error.value = ''
  try {
    reading.value = await $fetch<FullTrashedDoc>(`/api/trash/${encodeURIComponent(d.id)}`)
  } catch (e) {
    notThereOr(e, 'Could not open this note. Check your connection and try again.')
  } finally {
    busyId.value = null
  }
}

async function restore(d: { id: string; title: string }) {
  busyId.value = d.id
  error.value = ''
  restoredDoc.value = null
  try {
    const doc = await $fetch<DocMeta>(`/api/trash/${encodeURIComponent(d.id)}/restore`, { method: 'POST' })
    items.value = items.value.filter((x) => x.id !== d.id)
    reading.value = null
    restoredDoc.value = { id: doc.id, title: doc.title }
    emit('restored', doc)
  } catch (e) {
    notThereOr(e, 'Could not restore this note. Check your connection and try again.')
  } finally {
    busyId.value = null
  }
}

/** 404: someone else restored it (a public note), or its 30 days are over. Show the Trash as it is now. */
function notThereOr(e: unknown, otherwise: string) {
  if (errorStatus(e) === 404) {
    error.value = 'This note is not in the Trash any more.'
    reading.value = null
    void load()
  } else {
    error.value = otherwise
  }
}

function deletedText(d: TrashedDoc) {
  const days = daysBetween(toDayKey(new Date(d.deletedAt)), todayKey())
  if (days <= 0) return 'Deleted today'
  if (days === 1) return 'Deleted yesterday'
  return `Deleted ${days} days ago`
}

function purgeText(d: TrashedDoc) {
  const days = Math.ceil((Date.parse(d.purgeAt) - Date.now()) / 86_400_000)
  return days > 0 ? `Deleted for good in ${plural(days, 'day')}` : 'Deleted for good soon'
}

// Escape: back to the list when reading a note, else close.
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (reading.value) reading.value = null
  else emit('close')
}

watch(() => props.open, (open) => {
  if (open) {
    reading.value = null
    error.value = ''
    restoredDoc.value = null
    void load()
    window.addEventListener('keydown', onKey)
  } else {
    window.removeEventListener('keydown', onKey)
  }
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[9990] bg-black/70 flex items-center justify-center p-4"
        @click.self="emit('close')"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="trash-title"
          class="w-full flex flex-col rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black"
          :class="reading ? 'max-w-3xl h-[85vh]' : 'max-w-lg max-h-[85vh]'"
        >
          <!-- Reading one note (view only) -->
          <template v-if="reading">
            <div class="flex items-center gap-2 px-3 py-3 border-b border-[#161616] shrink-0">
              <button class="btn btn-ghost btn-sm shrink-0" title="Back to the Trash" @click="reading = null">
                <ArrowLeftIcon :size="15" />
                Trash
              </button>
              <div class="flex-1 min-w-0">
                <h3 id="trash-title" class="text-sm font-medium text-[#f0f0f0] truncate">{{ reading.title || 'Untitled' }}</h3>
                <p class="text-2xs text-[#666]">View only · {{ purgeText(reading) }}</p>
              </div>
              <button
                class="btn btn-accent btn-sm shrink-0"
                :class="{ 'opacity-50 pointer-events-none': busyId === reading.id }"
                @click="restore(reading)"
              >
                <RotateCcwIcon :size="14" />
                Restore
              </button>
            </div>
            <div class="trash-reader flex flex-col flex-1 min-h-0">
              <EditorRoot
                :key="reading.id"
                :model-value="reading.content"
                :doc-id="`trash:${reading.id}`"
                :editable="false"
              />
            </div>
          </template>

          <!-- The list -->
          <template v-else>
            <div class="px-5 pt-5 pb-3 shrink-0">
              <h3 id="trash-title" class="flex items-center gap-2 text-sm font-medium text-[#f0f0f0]">
                <Trash2Icon :size="15" class="text-[#777]" />
                Trash
              </h3>
              <p class="text-xs text-[#666] mt-1">Deleted notes stay here for 30 days. Then they are deleted for good.</p>
            </div>

            <div class="overflow-y-auto min-h-0 px-5 pb-2">
              <p v-if="loading && items.length === 0" class="py-6 text-center text-xs text-[#444]">Loading…</p>
              <p v-else-if="loadFailed" class="py-6 text-center text-xs text-[#888]">
                Could not load the Trash.
                <button class="text-[#a5b4fc] hover:underline" @click="load">Try again</button>
              </p>
              <p v-else-if="items.length === 0" class="py-6 text-center text-xs text-[#444]">The Trash is empty.</p>
              <template v-else>
                <section v-for="s in sections" :key="s.key">
                  <h4 v-if="s.name" class="pt-3 pb-1.5 text-2xs text-[#555] select-none">
                    <span class="font-semibold uppercase tracking-wider">{{ s.name }}</span>
                    <span class="text-[#333]"> · {{ s.who }}</span>
                  </h4>
                  <ul>
                    <li
                      v-for="d in s.list"
                      :key="d.id"
                      class="trash-item flex items-center gap-3 py-2.5 border-t border-[#161616]"
                      :class="{ 'opacity-50 pointer-events-none': busyId === d.id }"
                    >
                      <button
                        class="group flex-1 min-w-0 flex items-start gap-2.5 text-left"
                        title="Read this note (view only)"
                        @click="read(d)"
                      >
                        <LockIcon v-if="d.isPrivate" :size="15" class="shrink-0 mt-0.5 text-[#444]" />
                        <FileTextIcon v-else :size="15" class="shrink-0 mt-0.5 text-[#444]" />
                        <span class="min-w-0">
                          <span class="block text-sm text-[#ccc] truncate group-hover:text-[#f0f0f0] group-hover:underline">
                            {{ d.title || 'Untitled' }}
                          </span>
                          <span class="block text-2xs text-[#555] mt-0.5">{{ deletedText(d) }} · {{ purgeText(d) }}</span>
                        </span>
                      </button>
                      <button class="btn btn-sm shrink-0" @click="restore(d)">
                        <RotateCcwIcon :size="14" />
                        Restore
                      </button>
                    </li>
                  </ul>
                </section>
              </template>
            </div>
          </template>

          <!-- A message, and Close -->
          <div class="px-5 py-3.5 flex items-center justify-between gap-3 border-t border-[#161616] shrink-0">
            <p v-if="error" class="text-xs text-[#ef4444] min-w-0" role="alert">{{ error }}</p>
            <p v-else-if="restoredDoc" class="text-xs text-[#86efac] min-w-0" role="status">
              “{{ restoredDoc.title || 'Untitled' }}” is back in the notes list.
              <button class="ml-1 text-[#a5b4fc] hover:underline" @click="emit('open-note', restoredDoc.id)">Open it</button>
            </p>
            <span v-else />
            <button class="btn shrink-0" @click="emit('close')">Close</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* The note being read: no extra empty space under it, and less space around it in the small window */
.trash-reader :deep(.ProseMirror) {
  min-height: 0;
  padding: 1rem 1.25rem 1.5rem;
}
</style>
