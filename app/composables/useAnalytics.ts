import type { Ref } from 'vue'

// Helpers for the analytics page: "reduce motion", show-on-scroll, the width of a box,
// and which bar of a chart the mouse, a finger or the arrow keys point at.

/** True when the device asks for less motion. Then the page shows everything at once, still. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** Becomes true the first time the box comes on the screen (right away with "reduce motion"). */
export function useRevealOnScroll(el: Ref<HTMLElement | null>) {
  const shown = ref(false)
  let observer: IntersectionObserver | null = null
  onMounted(() => {
    if (!el.value || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      shown.value = true
      return
    }
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      shown.value = true
      observer?.disconnect()
      observer = null
    }, { threshold: 0.15 })
    observer.observe(el.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return shown
}

/**
 * The width of a box in pixels, kept up to date when the window changes size.
 * A width of 0 for a moment (the box hidden) keeps the last width, so a chart is not drawn again from the start.
 */
export function useBoxWidth(el: Ref<HTMLElement | null>) {
  const width = ref(0)
  let observer: ResizeObserver | null = null
  const measure = () => {
    const w = el.value?.clientWidth ?? 0
    if (w > 0) width.value = w
  }
  onMounted(() => {
    measure()
    if (el.value) {
      observer = new ResizeObserver(measure)
      observer.observe(el.value)
    }
  })
  onBeforeUnmount(() => observer?.disconnect())
  return width
}

/**
 * Which bar (or point) of a chart is picked: by the mouse, a finger, or the arrow keys.
 * `indexAt` turns a spot in the chart box (in pixels) into a bar number, or null for none.
 */
export function useChartCursor(
  box: Ref<HTMLElement | null>,
  count: () => number,
  indexAt: (x: number, y: number) => number | null,
) {
  const active = ref<number | null>(null)

  function onPointer(e: PointerEvent) {
    const r = box.value?.getBoundingClientRect()
    if (r) active.value = indexAt(e.clientX - r.left, e.clientY - r.top)
  }
  // With a finger the numbers stay after it lifts; a tap outside the chart hides them.
  function onLeave(e: PointerEvent) {
    if (e.pointerType !== 'touch') active.value = null
  }
  function onKey(e: KeyboardEvent) {
    const n = count()
    if (!n) return
    const now = active.value
    let next: number
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = now === null ? 0 : Math.min(n - 1, now + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = now === null ? n - 1 : Math.max(0, now - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if (e.key === 'Escape') { active.value = null; return }
    else return
    e.preventDefault()
    active.value = next
  }
  function onBlur() {
    active.value = null
  }
  function onDocDown(e: PointerEvent) {
    if (active.value !== null && box.value && !box.value.contains(e.target as Node)) active.value = null
  }
  onMounted(() => document.addEventListener('pointerdown', onDocDown))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocDown))

  return { active, onPointer, onLeave, onKey, onBlur }
}
