<script setup lang="ts">
import { BotIcon, CheckIcon, LinkIcon } from '@lucide/vue'
import { notePicturePath } from '#shared/notePictures'
import { noteForAi } from '#shared/noteText'
// The Share button opens a small menu:
// - Public note: copy its view link.
// - Private note: turn the view-only link on or off, and copy it.
// - Both: "Copy for AI" copies the note as text (with its link), ready to paste into an
//   AI chat. Pasted pictures become links to the pictures, so the AI can open them.
//   For a private note it turns the view-only link on first (the links need it).
const props = defineProps<{
  docId: string | null
  isPrivate: boolean
  shared: boolean
  /** The name and the text of the open note (for "Copy for AI"). */
  title: string
  content: Record<string, any> | null
  /** Icon-only button (phone header). */
  compact?: boolean
}>()

const emit = defineEmits<{
  'set-shared': [on: boolean]
}>()

/** What was copied last, for a short "Copied!". */
const copied = ref<'link' | 'ai' | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)
useClickOutside(root, () => { menuOpen.value = false })

// Close the menu when another note is opened.
watch(() => props.docId, () => { menuOpen.value = false })

const viewLink = () => `${window.location.origin}/doc/${props.docId}`

async function copy(text: string, what: 'link' | 'ai') {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = null }, 2000)
  } catch {
    // Clipboard not allowed: nothing to do.
  }
}

function copyLink() {
  if (props.docId) void copy(viewLink(), 'link')
}

function startSharing() {
  emit('set-shared', true)
  copyLink()
}

function stopSharing() {
  emit('set-shared', false)
  menuOpen.value = false
}

/** The note as text with its link, for an AI chat. A private note gets its view-only link turned on. */
function copyForAi() {
  const docId = props.docId
  if (!docId) return
  if (props.isPrivate && !props.shared) emit('set-shared', true)
  // A pasted picture → its own web address (shared/notePictures.ts).
  const pictureAddress = (src: string) => {
    const path = notePicturePath(docId, src)
    return path && `${window.location.origin}${path}`
  }
  void copy(noteForAi(props.title, viewLink(), props.content, pictureAddress), 'ai')
}

onBeforeUnmount(() => { if (copiedTimer) clearTimeout(copiedTimer) })
</script>

<template>
  <div v-if="docId" ref="root" class="relative shrink-0">
    <button
      :class="compact
        ? ['flex items-center justify-center w-9 h-9 rounded transition-colors', copied ? 'bg-emerald-900/20 text-emerald-400' : 'text-[#999] hover:bg-[#1a1a1a]']
        : ['flex items-center gap-1.5 text-btn px-3 max-md:px-2 py-1.5 rounded border transition-colors', copied
          ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400'
          : 'bg-[#111] border-[#1f1f1f] text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]']"
      :title="isPrivate ? 'Share this private note' : 'Share this note'"
      :aria-expanded="menuOpen"
      @click="menuOpen = !menuOpen"
    >
      <LinkIcon v-if="!copied" :size="compact ? 18 : 16" />
      <CheckIcon v-else :size="compact ? 18 : 16" />
      <span v-if="!compact" class="hidden xl:inline">{{ copied ? 'Copied!' : 'Share' }}</span>
    </button>

    <div v-if="menuOpen" class="menu-panel absolute right-0 top-full mt-2 z-50 w-72 text-left">
      <!-- Public note -->
      <template v-if="!isPrivate">
        <p class="text-xs text-[#888] leading-relaxed mb-3">
          This is a public note. Everyone can see and edit it.
        </p>
        <button class="btn btn-accent w-full" @click="copyLink">{{ copied === 'link' ? 'Copied!' : 'Copy link' }}</button>
      </template>

      <!-- Private note, link off -->
      <template v-else-if="!shared">
        <p class="text-xs text-[#888] leading-relaxed mb-3">
          This note is private. Only you can see it.
        </p>
        <button class="btn btn-accent w-full" @click="startSharing">Share a view-only link</button>
      </template>

      <!-- Private note, link on -->
      <template v-else>
        <p class="text-xs text-[#888] leading-relaxed mb-3">
          Anyone with the link can view this note. They can't edit it.
        </p>
        <div class="flex gap-2">
          <button class="btn btn-accent flex-1" @click="copyLink">{{ copied === 'link' ? 'Copied!' : 'Copy link' }}</button>
          <button class="btn flex-1" @click="stopSharing">Stop sharing</button>
        </div>
      </template>

      <!-- All notes: the note as text, for an AI chat -->
      <div class="mt-3 pt-3 border-t border-[#1a1a1a]">
        <button class="btn w-full" @click="copyForAi">
          <CheckIcon v-if="copied === 'ai'" :size="14" class="text-emerald-400" />
          <BotIcon v-else :size="14" />
          {{ copied === 'ai' ? 'Copied for AI!' : 'Copy for AI' }}
        </button>
        <p class="text-2xs text-[#555] leading-relaxed mt-2">
          Copies the note as text, with links to the note and its pictures, to paste into an AI chat (ChatGPT, Claude…).
          <template v-if="isPrivate && !shared">This turns the view-only link on.</template>
        </p>
      </div>
    </div>
  </div>
</template>
