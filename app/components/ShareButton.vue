<script setup lang="ts">
// Public note: click copies the view link (same as before).
// Private note: click opens a small menu to turn the view-only link on or off.
const props = defineProps<{
  docId: string | null
  isPrivate: boolean
  shared: boolean
  /** Icon-only button (phone header). */
  compact?: boolean
}>()

const emit = defineEmits<{
  'set-shared': [on: boolean]
}>()

const copied = ref(false)
const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)
useClickOutside(root, () => { menuOpen.value = false })

// Close the menu when another note is opened.
watch(() => props.docId, () => { menuOpen.value = false })

async function copyLink() {
  if (!props.docId) return
  try {
    await navigator.clipboard.writeText(`${window.location.origin}/doc/${props.docId}`)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Clipboard not allowed: nothing to do.
  }
}

function onClick() {
  if (!props.docId) return
  if (props.isPrivate) menuOpen.value = !menuOpen.value
  else copyLink()
}

function startSharing() {
  emit('set-shared', true)
  copyLink()
}

function stopSharing() {
  emit('set-shared', false)
  menuOpen.value = false
}
</script>

<template>
  <div v-if="docId" ref="root" class="relative shrink-0">
    <button
      :class="compact
        ? ['flex items-center justify-center w-9 h-9 rounded transition-colors', copied ? 'bg-emerald-900/20 text-emerald-400' : 'text-[#999] hover:bg-[#1a1a1a]']
        : ['flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors', copied
          ? 'bg-emerald-900/20 border-emerald-700/30 text-emerald-400'
          : 'bg-[#111] border-[#1f1f1f] text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]']"
      :title="isPrivate ? 'Share this private note' : 'Copy shareable view link'"
      @click="onClick"
    >
      <svg v-if="!copied" :width="compact ? 14 : 12" :height="compact ? 14 : 12" viewBox="0 0 12 12" fill="none">
        <path d="M5 7a3 3 0 004.2 0l1.5-1.5a3 3 0 00-4.2-4.2L5.8 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M7 5a3 3 0 00-4.2 0L1.3 6.5a3 3 0 004.2 4.2L6.2 10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      <svg v-else :width="compact ? 14 : 12" :height="compact ? 14 : 12" viewBox="0 0 12 12" fill="none">
        <path d="M1.5 6l3.5 3.5 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span v-if="!compact" class="hidden lg:inline">{{ copied ? 'Copied!' : 'Share' }}</span>
    </button>

    <div v-if="menuOpen" class="menu-panel absolute right-0 top-full mt-2 z-50 w-64 text-left">
      <template v-if="!shared">
        <p class="text-xs text-[#888] leading-relaxed mb-3">
          This note is private. Only you can see it.
        </p>
        <button class="btn btn-accent w-full" @click="startSharing">Share a view-only link</button>
      </template>
      <template v-else>
        <p class="text-xs text-[#888] leading-relaxed mb-3">
          Anyone with the link can view this note. They can't edit it.
        </p>
        <div class="flex gap-2">
          <button class="btn btn-accent flex-1" @click="copyLink">{{ copied ? 'Copied!' : 'Copy link' }}</button>
          <button class="btn flex-1" @click="stopSharing">Stop sharing</button>
        </div>
      </template>
    </div>
  </div>
</template>
