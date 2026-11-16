import type { SharedTasks } from '~/types/tasks'

// The tasks behind a Daily tasks share link. Used by the share page and by its analytics page.
// It loads again every minute (and when you come back to the tab), so new tasks and ticks show up.
// failed: 'gone' = the link does not work (any more), 'network' = it could not load at all.
export function useSharedTasks(id: string, onFirstLoad?: (res: SharedTasks) => void) {
  const data = ref<SharedTasks | null>(null)
  const failed = ref<'gone' | 'network' | null>(null)
  const loading = ref(true)
  const today = ref(todayKey())

  /** The shared months, like ["2026-09", "2026-10", …]. */
  const months = computed(() => {
    if (!data.value) return []
    const [y, m] = data.value.from.split('-').map(Number)
    return Array.from({ length: monthCount(data.value.from, data.value.to) }, (_, i) =>
      toMonthKey(new Date(y!, m! - 1 + i, 1)))
  })

  async function load(first = false) {
    try {
      const res = await $fetch<SharedTasks>(`/api/shared-tasks/${encodeURIComponent(id)}`)
      data.value = res
      failed.value = null
      if (first) onFirstLoad?.(res)
    } catch (e) {
      if (errorStatus(e) === 404) {
        data.value = null
        failed.value = 'gone'
      } else if (!data.value) {
        failed.value = 'network'
      }
    } finally {
      loading.value = false
    }
  }

  let timer: ReturnType<typeof setInterval> | null = null
  function onVisible() {
    if (document.visibilityState !== 'visible') return
    today.value = todayKey()
    void load()
  }
  onMounted(() => {
    void load(true)
    timer = setInterval(() => {
      today.value = todayKey()
      if (document.visibilityState === 'visible' && failed.value !== 'gone') void load()
    }, 60_000)
    document.addEventListener('visibilitychange', onVisible)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisible)
  })

  function retry() {
    loading.value = true
    failed.value = null
    void load(true)
  }

  return { data, failed, loading, today, months, retry }
}
