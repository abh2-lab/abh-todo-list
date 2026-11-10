<script setup lang="ts">
import { tourSteps } from '~/lib/tourSteps'

// The help tour: lights up one part of the app at a time, with a small box that says
// what it is and how to use it. Opened from the Help button (and once by itself for someone new).
const { open, step, close } = useTour()
const { loggedIn } = useUserSession()
const isMobile = useIsMobile()

const steps = computed(() => tourSteps({ loggedIn: loggedIn.value, phone: isMobile.value }))
const index = computed(() => Math.min(step.value, steps.value.length - 1))
const current = computed(() => steps.value[index.value])
const isLast = computed(() => index.value === steps.value.length - 1)

// ---- Where things go on the screen ----
const PAD = 6 // space around the lit-up part
const GAP = 12 // space between the part and the box
const EDGE = 12 // keep the box this far from the edges of the screen

const spot = ref<{ top: number; left: number; width: number; height: number } | null>(null)
const boxPos = ref<{ top: number; left: number } | null>(null) // null = in the middle of the screen
const boxEl = ref<HTMLElement | null>(null)
const nextBtn = ref<HTMLButtonElement | null>(null)

/** The part to light up, if it is on the screen right now. */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect()
    const onScreen = r.width > 0 && r.height > 0
      && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
    if (onScreen) return el
  }
  return null
}

function place() {
  const name = current.value?.target
  const el = name ? findTarget(name) : null
  if (!el) {
    spot.value = null
    boxPos.value = null
    return
  }
  const r = el.getBoundingClientRect()
  // The lit-up frame, kept inside the screen (a wide toolbar would go past the edges).
  const left = Math.max(2, r.left - PAD)
  const top = Math.max(2, r.top - PAD)
  const right = Math.min(window.innerWidth - 2, r.right + PAD)
  const bottom = Math.min(window.innerHeight - 2, r.bottom + PAD)
  const s = { top, left, width: right - left, height: bottom - top }
  spot.value = s

  const w = boxEl.value?.offsetWidth ?? 320
  const h = boxEl.value?.offsetHeight ?? 170
  // Under the part, or above it when there is no room under it.
  let boxTop = s.top + s.height + GAP
  if (boxTop + h > window.innerHeight - EDGE) boxTop = Math.max(EDGE, s.top - GAP - h)
  const boxLeft = Math.min(Math.max(EDGE, r.left + r.width / 2 - w / 2), window.innerWidth - w - EDGE)
  boxPos.value = { top: boxTop, left: boxLeft }
}

let timer: ReturnType<typeof setTimeout> | null = null
function placeSoon() {
  nextTick(() => {
    place()
    nextBtn.value?.focus({ preventScroll: true })
    // Some parts show up a moment later (like the toolbar while a note loads): place it again.
    if (timer) clearTimeout(timer)
    timer = setTimeout(place, 250)
  })
}

watch([open, index, steps], () => {
  if (open.value) placeSoon()
})

function next() {
  if (isLast.value) close()
  else step.value = index.value + 1
}

function back() {
  if (index.value > 0) step.value = index.value - 1
}

function onKey(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    next()
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    back()
  } else if (e.key === 'Tab') {
    // Keep the keyboard inside the box while the tour is open.
    const buttons = [...(boxEl.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    if (!buttons.length) return
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    e.preventDefault()
    const to = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length
    buttons[to]!.focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('resize', place)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', place)
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && current"
      class="fixed inset-0 z-[9998]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-text"
    >
      <!-- The screen goes dark, but the part we talk about stays lit -->
      <div
        v-if="spot"
        class="tour-spot"
        :style="{ top: `${spot.top}px`, left: `${spot.left}px`, width: `${spot.width}px`, height: `${spot.height}px` }"
      />
      <div v-else class="absolute inset-0 bg-black/70" />

      <div
        ref="boxEl"
        class="tour-box fixed w-[min(320px,calc(100vw-24px))] rounded-xl border border-[#262640] bg-[#0b0b0b] p-4 shadow-2xl shadow-black"
        :class="boxPos ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'"
        :style="boxPos ? { top: `${boxPos.top}px`, left: `${boxPos.left}px` } : undefined"
      >
        <div class="text-[11px] text-[#666]">{{ index + 1 }} of {{ steps.length }}</div>
        <h3 id="tour-title" class="mt-1 text-sm font-medium text-[#f0f0f0]">{{ current.title }}</h3>
        <p id="tour-text" class="mt-1.5 text-xs leading-relaxed text-[#aaa]">{{ current.text }}</p>
        <div class="mt-4 flex items-center gap-2">
          <button v-if="!isLast" type="button" class="btn btn-sm btn-ghost -ml-2" @click="close">Skip tour</button>
          <span class="flex-1" />
          <button v-if="index > 0" type="button" class="btn btn-sm" @click="back">Back</button>
          <button ref="nextBtn" type="button" class="btn btn-sm btn-accent" @click="next">
            {{ isLast ? 'Done' : 'Next' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-spot {
  position: fixed;
  border-radius: 8px;
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.7);
  outline: 2px solid rgba(129, 140, 248, 0.9);
  pointer-events: none;
  transition: top 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
}

.tour-box {
  animation: tour-in 0.15s ease-out;
}

@keyframes tour-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
