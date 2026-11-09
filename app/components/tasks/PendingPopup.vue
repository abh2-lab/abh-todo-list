<script setup lang="ts">
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

function remove(id: string) {
  if (confirm('Delete this task?')) run(id, removeTask)
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
              <div class="text-sm text-[#ddd] break-words">{{ t.text }}</div>
              <div class="text-[11px] text-[#ef4444] mt-0.5">From {{ shortDay(t.day) }}</div>
              <div class="flex flex-wrap gap-2 mt-2" :class="{ 'opacity-50 pointer-events-none': busyId === t.id }">
                <button class="btn" @click="run(t.id, markDone)">
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  Done
                </button>
                <button class="btn btn-accent" @click="run(t.id, moveToToday)">
                  <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><path d="M2.5 7h9M8 3.5L11.5 7 8 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  Move to today
                </button>
                <button class="btn" title="Delete task" @click="remove(t.id)">
                  <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><path d="M1 2h8M3 2V1.5a.5.5 0 011 0V2M2.5 2l.5 7h3.5l.5-7" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  Delete
                </button>
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
