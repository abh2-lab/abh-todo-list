<script setup lang="ts">
import { ArrowRightIcon, CheckIcon, ExternalLinkIcon, Trash2Icon } from '@lucide/vue'
import type { Task } from '~/types/tasks'

// List of pending tasks (day is over, still not done).
// Opens by itself once a day, or from the Pending button.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { pending, markDone, moveToToday, removeTask } = usePendingTasks()
const busyId = ref<string | null>(null)
const error = ref('')

async function run(id: string, action: (id: string) => Promise<void>) {
  busyId.value = id
  error.value = ''
  try {
    await action(id)
  } catch {
    error.value = 'Could not save. Try again.'
  } finally {
    busyId.value = null
  }
}

function remove(t: Task) {
  const ask = t.docId
    ? 'Remove this task from the list? The line stays in your note.'
    : 'Delete this task?'
  if (confirm(ask)) run(t.id, removeTask)
}

/** "Open note" opens the note in a new tab, at the task's line. */
function noteLink(t: Task) {
  return `/?doc=${encodeURIComponent(t.docId!)}&task=${encodeURIComponent(t.id)}`
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
watch(() => props.open, (open) => {
  if (open) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
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
        <div class="w-full max-w-md max-h-[85vh] flex flex-col rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black">
          <div class="px-5 pt-5 pb-3">
            <h3 class="text-sm font-medium text-[#f0f0f0]">
              <template v-if="pending.length">
                You have {{ pending.length }} pending {{ pending.length === 1 ? 'task' : 'tasks' }}
              </template>
              <template v-else>No pending tasks</template>
            </h3>
            <p class="text-xs text-[#666] mt-1">
              {{ pending.length ? 'These were not done on their day.' : 'Nothing is left over from past days.' }}
            </p>
          </div>

          <ul class="overflow-y-auto px-5">
            <li v-for="t in pending" :key="t.id" class="py-3 border-t border-[#161616]">
              <div class="text-sm break-words" :class="t.text ? 'text-[#ddd]' : 'italic text-[#555]'">{{ t.text || 'Empty line' }}</div>
              <div class="text-2xs mt-0.5 text-[#ef4444]">From {{ shortDay(t.day) }}</div>
              <div class="flex flex-wrap gap-2 mt-2" :class="{ 'opacity-50 pointer-events-none': busyId === t.id }">
                <button class="btn" @click="run(t.id, markDone)">
                  <CheckIcon :size="15" />
                  Done
                </button>
                <button class="btn btn-accent" @click="run(t.id, moveToToday)">
                  <ArrowRightIcon :size="15" />
                  Move to today
                </button>
                <button class="btn" :title="t.docId ? 'Remove from the list (the line stays in the note)' : 'Delete task'" @click="remove(t)">
                  <Trash2Icon :size="15" />
                  Delete
                </button>
                <a
                  v-if="t.docId"
                  :href="noteLink(t)"
                  target="_blank"
                  rel="noopener"
                  class="btn btn-ghost"
                  title="Open the note at this line (new tab)"
                >
                  Open note
                  <ExternalLinkIcon :size="14" />
                </a>
              </div>
            </li>
          </ul>

          <div class="px-5 py-4 flex items-center justify-between gap-3 border-t border-[#161616]">
            <p class="text-xs text-[#ef4444] min-w-0">{{ error }}</p>
            <button class="btn" @click="emit('close')">Close</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
