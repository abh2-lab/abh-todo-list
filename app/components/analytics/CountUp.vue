<script setup lang="ts">
// A number that counts up to its value when `play` turns on, and moves to the new value
// when it changes. With "reduce motion" on the device it just shows the value.
const props = withDefaults(defineProps<{
  value: number
  /** Digits after the dot, like 1 for 3.4 */
  decimals?: number
  play?: boolean
}>(), { decimals: 0, play: true })

const DURATION = 900
const now = ref(0)
let frame = 0
let safety: ReturnType<typeof setTimeout> | null = null

function stop() {
  if (frame) cancelAnimationFrame(frame)
  if (safety) clearTimeout(safety)
  frame = 0
  safety = null
}

function countTo(to: number) {
  stop()
  const from = now.value
  if (from === to || prefersReducedMotion()) {
    now.value = to
    return
  }
  const start = performance.now()
  const step = (time: number) => {
    // (The first frame's time can be a little before `start`.)
    const t = Math.min(1, Math.max(0, (time - start) / DURATION))
    now.value = from + (to - from) * (1 - (1 - t) ** 3) // fast first, then slow
    frame = t < 1 ? requestAnimationFrame(step) : 0
  }
  frame = requestAnimationFrame(step)
  // If the browser holds the animation back (a hidden tab), still end on the right number.
  safety = setTimeout(() => {
    stop()
    now.value = to
  }, DURATION + 400)
}

watch(() => [props.value, props.play] as const, ([value, play]) => {
  if (play) countTo(value)
}, { immediate: true })
onBeforeUnmount(stop)

const format = (v: number) =>
  v.toLocaleString(undefined, { minimumFractionDigits: props.decimals, maximumFractionDigits: props.decimals })
</script>

<template>
  <span><span aria-hidden="true">{{ format(now) }}</span><span class="sr-only">{{ format(value) }}</span></span>
</template>
