<script setup lang="ts">
import type { TaskShare } from '~/types/tasks'

// "Share" in Daily tasks: make a view-only link to your tasks of some months,
// see your links, copy them, or stop sharing one.
const props = defineProps<{
  open: boolean
  /** The month the calendar shows, like "2026-11": picked first. */
  month: string
}>()

const emit = defineEmits<{ close: [] }>()

const MAX_MONTHS = 24

/** The months to pick from: two years back to one year ahead. */
const months = computed(() => {
  const now = new Date()
  return Array.from({ length: 37 }, (_, i) => {
    const key = toMonthKey(new Date(now.getFullYear(), now.getMonth() - 24 + i, 1))
    return { value: key, label: monthName(key) }
  })
})

const from = ref('')
const to = ref('')
const shares = ref<TaskShare[]>([])
const loadingList = ref(false)
const listError = ref('')
const busy = ref(false)
const error = ref('')
const madeId = ref<string | null>(null)
const copiedId = ref<string | null>(null)

const made = computed(() => shares.value.find((s) => s.id === madeId.value) ?? null)

function linkOf(id: string) {
  return `${window.location.origin}/shared/tasks/${id}`
}

async function loadShares() {
  loadingList.value = true
  listError.value = ''
  try {
    shares.value = await $fetch<TaskShare[]>('/api/task-shares')
  } catch {
    listError.value = 'Could not load your links. Check your connection and try again.'
  } finally {
    loadingList.value = false
  }
}

watch(() => props.open, (open) => {
  if (!open) return
  // Start with the month the calendar shows (or this month, if that one is not in the list).
  const start = months.value.some((m) => m.value === props.month) ? props.month : toMonthKey(new Date())
  from.value = start
  to.value = start
  error.value = ''
  madeId.value = null
  copiedId.value = null
  void loadShares()
})

// The first month moved past the last one: move the last one along.
watch(from, (f) => { if (to.value && to.value < f) to.value = f })

async function makeLink() {
  error.value = ''
  if (to.value < from.value) {
    error.value = 'The last month must be the same as the first month, or after it.'
    return
  }
  if (monthCount(from.value, to.value) > MAX_MONTHS) {
    error.value = `One link can show at most ${MAX_MONTHS} months.`
    return
  }
  busy.value = true
  try {
    const share = await $fetch<TaskShare>('/api/task-shares', { method: 'POST', body: { from: from.value, to: to.value } })
    shares.value.unshift(share)
    madeId.value = share.id
    // Copy it right away if the browser lets us (some only allow copying straight after a click).
    void copy(share.id, { quiet: true })
  } catch (e) {
    error.value = errorMessage(e) ?? 'Could not make the link. Try again.'
  } finally {
    busy.value = false
  }
}

async function copy(id: string, opts: { quiet?: boolean } = {}) {
  try {
    await navigator.clipboard.writeText(linkOf(id))
    copiedId.value = id
    setTimeout(() => { if (copiedId.value === id) copiedId.value = null }, 2000)
  } catch {
    // The browser does not allow copying here: show the link so it can be copied by hand.
    // (quiet: the new link is already in the box on the screen.)
    if (!opts.quiet) window.prompt('Copy this link:', linkOf(id))
  }
}

async function stopSharing(s: TaskShare) {
  if (!confirm(`Stop sharing ${monthRange(s.from, s.to)}? The link stops working right away.`)) return
  error.value = ''
  try {
    await $fetch(`/api/task-shares/${s.id}`, { method: 'DELETE' })
    shares.value = shares.value.filter((x) => x.id !== s.id)
    if (madeId.value === s.id) madeId.value = null
  } catch {
    error.value = 'Could not stop sharing. Try again.'
  }
}

function madeOn(s: TaskShare) {
  return new Date(s.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
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
        <div
          class="w-full max-w-md max-h-[88vh] flex flex-col rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black"
          role="dialog"
          aria-modal="true"
          aria-label="Share your Daily tasks"
        >
          <div class="px-5 pt-5 pb-4 overflow-y-auto">
            <h3 class="text-sm font-medium text-[#f0f0f0]">Share your Daily tasks</h3>
            <p class="text-xs text-[#777] mt-1.5 leading-relaxed">
              Anyone with the link can see your tasks of the months you pick: the task, its day, whether it is
              done or cancelled, and the day it was done. They can't change anything, and they don't see your notes.
            </p>

            <!-- Pick the months -->
            <div class="mt-4 flex flex-wrap items-end gap-3">
              <label class="flex flex-col gap-1 text-2xs text-[#666]">
                From
                <select v-model="from" class="bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#6366f1] [color-scheme:dark]">
                  <option v-for="m in months" :key="m.value" :value="m.value">{{ m.label }}</option>
                </select>
              </label>
              <label class="flex flex-col gap-1 text-2xs text-[#666]">
                To
                <select v-model="to" class="bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1.5 text-xs text-[#f0f0f0] outline-none focus:border-[#6366f1] [color-scheme:dark]">
                  <option v-for="m in months" :key="m.value" :value="m.value" :disabled="m.value < from">{{ m.label }}</option>
                </select>
              </label>
              <button
                class="btn btn-accent"
                :class="{ 'opacity-50 pointer-events-none': busy }"
                @click="makeLink"
              >
                {{ busy ? 'Making…' : 'Make a link' }}
              </button>
            </div>
            <p v-if="error" class="mt-2 text-xs text-[#ef4444]">{{ error }}</p>

            <!-- The new link -->
            <div v-if="made" class="mt-4 p-3 rounded-lg border border-[#6366f1]/30 bg-[#0d0d1a]">
              <div class="text-xs text-[#a5b4fc]">
                {{ copiedId === made.id ? 'Link copied.' : 'Your new link' }} ({{ monthRange(made.from, made.to) }})
              </div>
              <div class="mt-2 flex gap-2">
                <input
                  :value="linkOf(made.id)"
                  readonly
                  class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1 text-xs text-[#ddd] outline-none focus:border-[#6366f1]"
                  aria-label="The new link"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <button class="btn btn-sm" @click="copy(made.id)">{{ copiedId === made.id ? 'Copied!' : 'Copy' }}</button>
              </div>
            </div>

            <!-- All your links -->
            <h4 class="mt-5 text-xs font-medium text-[#aaa]">Your links</h4>
            <p v-if="loadingList && !shares.length" class="mt-2 text-xs text-[#555]">Loading…</p>
            <p v-else-if="listError" class="mt-2 text-xs text-[#ef4444]">{{ listError }}</p>
            <p v-else-if="!shares.length" class="mt-2 text-xs text-[#555]">No links yet.</p>
            <ul v-else class="mt-1">
              <li
                v-for="s in shares"
                :key="s.id"
                class="py-2.5 border-t border-[#161616] first:border-t-0 flex flex-wrap items-center gap-x-3 gap-y-1.5"
              >
                <div class="flex-1 min-w-[9rem]">
                  <div class="text-sm text-[#ddd]">{{ monthRange(s.from, s.to) }}</div>
                  <div class="text-2xs text-[#555]">Made {{ madeOn(s) }}</div>
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <button class="btn btn-sm" @click="copy(s.id)">{{ copiedId === s.id ? 'Copied!' : 'Copy link' }}</button>
                  <a class="btn btn-sm btn-ghost" :href="linkOf(s.id)" target="_blank" rel="noopener">Open</a>
                  <button class="btn btn-sm btn-danger" @click="stopSharing(s)">Stop sharing</button>
                </div>
              </li>
            </ul>
          </div>

          <div class="px-5 py-3 flex justify-end border-t border-[#161616]">
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
