<script setup lang="ts">
import type { EditHold, OtherEditor, SaveConflict } from '~/types/docs'

// Warnings when two people (or two of your tabs) edit the same note:
// - a box that asks first ("Just read" or "Edit anyway"),
// - a box when someone else saved after you opened the note ("Use theirs" or "Save mine"),
// - a small bar while you are only reading.
const props = defineProps<{
  hold: EditHold
  editors: OtherEditor[]
  conflict: SaveConflict | null
}>()

const emit = defineEmits<{
  'edit-anyway': []
  'just-read': []
  'keep-mine': []
  'take-theirs': []
}>()

const people = computed(() => props.editors.filter((e) => !e.you))
/** Only you are editing it, in another tab or on another device. */
const onlyYou = computed(() => props.editors.length > 0 && people.value.length === 0)

/** "Rohit", "Someone", "Rohit and 1 other person", "Rohit and 2 other people" */
const who = computed(() => {
  const list = people.value
  const first = list[0]?.name ?? 'Someone'
  const more = list.length - 1
  return more > 0 ? `${first} and ${more} other ${more === 1 ? 'person' : 'people'}` : first
})
const isAre = computed(() => (people.value.length > 1 ? 'are' : 'is'))

const ask = computed(() => {
  if (props.hold === 'opened') {
    return onlyYou.value
      ? {
          title: 'This note is open in another tab',
          text: 'You are editing this note in another tab or on another device. If you edit it in both places, you may lose changes. It\'s best to edit a note in one place at a time.',
          go: 'Edit here anyway',
        }
      : {
          title: `${who.value} ${isAre.value} editing this note`,
          text: 'If you both edit it at the same time, one of you may lose changes. It\'s best if only one person edits a note at a time.',
          go: 'Edit anyway',
        }
  }
  if (props.hold === 'started') {
    return onlyYou.value
      ? {
          title: 'This note is being edited in another tab',
          text: 'You started editing this note in another tab or on another device. If you edit it in both places, you may lose changes. It\'s best to edit a note in one place at a time.',
          go: 'Keep editing here',
        }
      : {
          title: `${who.value} started editing this note`,
          text: 'If you both edit it at the same time, one of you may lose changes. It\'s best if only one person edits a note at a time.',
          go: 'Keep editing',
        }
  }
  return null
})

const clash = computed(() => {
  const c = props.conflict
  if (!c) return null
  const title = c.title.trim() || 'Untitled'
  if (c.by?.you) {
    return {
      title: 'You changed this note in another tab',
      text: `You saved changes to "${title}" in another tab or on another device. The latest changes in this tab are not saved yet.`,
      mine: 'Save mine: this tab\'s version replaces the other one. Changes made there will be lost.',
      theirs: 'Use theirs: this tab shows the other version. The latest changes in this tab will be lost.',
    }
  }
  const name = c.by?.name ?? 'Someone'
  return {
    title: `${name} changed this note`,
    text: `${name} saved changes to "${title}" after you opened it. Your latest changes are not saved yet.`,
    mine: 'Save mine: your version replaces theirs. Their changes will be lost.',
    theirs: 'Use theirs: you see their version. Your latest changes will be lost.',
  }
})

const readingText = computed(() => {
  if (!props.editors.length) return 'Nobody else is editing this note now.'
  if (onlyYou.value) return 'This note is being edited in another tab. Here you are only reading it.'
  return `${who.value} ${isAre.value} editing this note. You are only reading it, and you see their changes as they are saved.`
})
</script>

<template>
  <!-- Someone else saved after you opened the note -->
  <div
    v-if="clash"
    class="fixed inset-0 z-[9992] bg-black/70 flex items-center justify-center p-4"
    role="alertdialog"
    aria-modal="true"
    :aria-label="clash.title"
  >
    <div class="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] p-5 shadow-2xl">
      <h2 class="text-sm font-medium text-[#f0f0f0]">{{ clash.title }}</h2>
      <p class="mt-2 text-sm text-[#aaa] leading-relaxed">{{ clash.text }}</p>
      <ul class="mt-3 space-y-1.5 text-xs text-[#888] leading-relaxed list-disc pl-4">
        <li>{{ clash.theirs }}</li>
        <li>{{ clash.mine }}</li>
      </ul>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button class="btn btn-accent" @click="emit('take-theirs')">Use theirs</button>
        <button class="btn" @click="emit('keep-mine')">Save mine</button>
      </div>
    </div>
  </div>

  <!-- Someone else is editing: ask first -->
  <div
    v-else-if="ask"
    class="fixed inset-0 z-[9992] bg-black/70 flex items-center justify-center p-4"
    role="alertdialog"
    aria-modal="true"
    :aria-label="ask.title"
  >
    <div class="w-full max-w-md rounded-xl border border-[#2a2a2a] bg-[#0b0b0b] p-5 shadow-2xl">
      <h2 class="text-sm font-medium text-[#f0f0f0]">{{ ask.title }}</h2>
      <p class="mt-2 text-sm text-[#aaa] leading-relaxed">{{ ask.text }}</p>
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        <button class="btn btn-accent" @click="emit('just-read')">Just read</button>
        <button class="btn" @click="emit('edit-anyway')">{{ ask.go }}</button>
      </div>
    </div>
  </div>

  <!-- You chose "Just read" -->
  <div
    v-else-if="hold === 'reading'"
    class="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9985] flex items-center gap-3 w-max max-w-[92vw] px-4 py-2.5 rounded-lg border border-[#6366f1]/30 bg-[#0d0d1a] text-xs text-[#c7d2fe] shadow-2xl"
    role="status"
  >
    <span>{{ readingText }}</span>
    <button class="btn btn-sm btn-accent shrink-0" @click="emit('edit-anyway')">
      {{ editors.length ? 'Edit anyway' : 'Edit' }}
    </button>
  </div>
</template>
