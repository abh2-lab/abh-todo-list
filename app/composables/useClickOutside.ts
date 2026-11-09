import type { Ref } from 'vue'

// Calls onOutside when the person clicks or taps anywhere outside `target`.
export function useClickOutside(target: Ref<HTMLElement | null>, onOutside: () => void) {
  function handler(e: Event) {
    const el = target.value
    if (el && !el.contains(e.target as Node)) onOutside()
  }
  onMounted(() => document.addEventListener('pointerdown', handler, true))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', handler, true))
}
