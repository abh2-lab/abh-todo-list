import type { Task } from '~/types/tasks'

// Pending tasks = their day is over (after midnight) and they are still not done.
// The list is shared by the header button, the phone menu and the popup.
export function usePendingTasks() {
  const pending = useState<Task[]>('pending-tasks', () => [])
  // Goes up every time a task changes, so the calendar knows to reload.
  const tasksVersion = useState('tasks-version', () => 0)
  const { loggedIn, user } = useUserSession()

  async function refreshPending() {
    if (!loggedIn.value) {
      pending.value = []
      return
    }
    try {
      pending.value = await $fetch<Task[]>('/api/tasks/pending', { query: { today: todayKey() } })
    } catch {
      // Keep the old list if the network fails; we try again later.
    }
  }

  /** Call after any task change. */
  function tasksChanged() {
    tasksVersion.value++
    return refreshPending()
  }

  async function markDone(id: string) {
    await $fetch(`/api/tasks/${id}`, { method: 'PUT', body: { done: true } })
    await tasksChanged()
  }

  async function moveToToday(id: string) {
    await $fetch(`/api/tasks/${id}`, { method: 'PUT', body: { day: todayKey() } })
    await tasksChanged()
  }

  async function removeTask(id: string) {
    await $fetch(`/api/tasks/${id}`, { method: 'DELETE' })
    await tasksChanged()
  }

  // The popup opens by itself at most once a day (per person, in this browser).
  const popupKey = () => `pending-popup-shown:${user.value?.id ?? ''}`
  function popupShownToday(): boolean {
    try {
      return localStorage.getItem(popupKey()) === todayKey()
    } catch {
      return false
    }
  }
  function rememberPopupShown() {
    try {
      localStorage.setItem(popupKey(), todayKey())
    } catch {
      // Private browsing: fine, the popup may show again.
    }
  }

  return {
    pending,
    count: computed(() => pending.value.length),
    tasksVersion,
    refreshPending,
    tasksChanged,
    markDone,
    moveToToday,
    removeTask,
    popupShownToday,
    rememberPopupShown,
  }
}
