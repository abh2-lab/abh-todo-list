import type { ShallowRef } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import type { Task } from '~/types/tasks'
import {
  refreshTaskLines,
  revealTaskLine,
  syncTaskLines,
  type LineTask,
  type TaskLinesStorage,
} from '~/lib/taskLines'

/** "Open note" in the task list asks the note to jump to this line. */
export interface FocusTask {
  docId: string
  taskId: string
}

export function useFocusTask() {
  return useState<FocusTask | null>('focus-task', () => null)
}

function sameTasks(a: Map<string, LineTask>, b: Map<string, LineTask>) {
  if (a.size !== b.size) return false
  for (const [id, t] of a) {
    const o = b.get(id)
    if (!o || o.done !== t.done || o.day !== t.day) return false
  }
  return true
}

/**
 * Links the "Today's task" lines of the open note with the Daily tasks list:
 * loads the note's tasks for the editor, and saves new marks and ticks.
 * Only for your own private notes (enabled).
 */
export function useLineTasks(
  editor: ShallowRef<Editor | undefined>,
  opts: { docId: () => string; enabled: () => boolean },
) {
  const { tasksVersion, tasksChanged } = usePendingTasks()
  const focusTask = useFocusTask()

  // ---- A short message when something could not be saved ----
  const error = ref('')
  let errorTimer: ReturnType<typeof setTimeout> | null = null
  function showError(message: string) {
    error.value = message
    if (errorTimer) clearTimeout(errorTimer)
    errorTimer = setTimeout(() => { error.value = '' }, 5000)
  }

  const storageOf = (e: Editor) => e.storage.taskLines as TaskLinesStorage

  // Changes we sent that the server may not have yet. A reload must not undo them.
  // "settled" = how many loads had started when the server said OK.
  // A load that started after that already has the change.
  let loadsStarted = 0
  const local = new Map<string, { task: LineTask; settled: number | null }>()

  function track(id: string, task: LineTask) {
    const entry = { task, settled: null as number | null }
    local.set(id, entry)
    return {
      settle: () => { if (local.get(id) === entry) entry.settled = loadsStarted },
      drop: () => { if (local.get(id) === entry) local.delete(id) },
    }
  }

  function revealIfAsked(e: Editor, docId: string) {
    const ask = focusTask.value
    if (!ask || ask.docId !== docId) return
    focusTask.value = null
    // Wait a moment so the note is drawn before we scroll.
    setTimeout(() => {
      if (!revealTaskLine(e, ask.taskId)) showError('This line is not in the note any more.')
    }, 50)
  }

  async function load() {
    const e = editor.value
    if (!e || e.isDestroyed) return
    const s = storageOf(e)
    const docId = opts.docId()

    if (!opts.enabled()) {
      if (s.enabled || s.tasks.size) {
        s.enabled = false
        s.tasks = new Map()
        refreshTaskLines(e)
      }
      return
    }
    s.enabled = true

    const n = ++loadsStarted
    let rows: Task[]
    try {
      rows = await $fetch<Task[]>('/api/tasks', { query: { docId } })
    } catch {
      return // keep what we have; we try again on the next change or when the tab is opened again
    }
    // A newer load is running, or the note changed meanwhile: let the newer one win.
    if (n !== loadsStarted || e.isDestroyed || opts.docId() !== docId || !opts.enabled()) return

    const map = new Map<string, LineTask>()
    for (const r of rows) map.set(r.id, { done: r.done, day: r.day })
    for (const [id, o] of local) {
      if (o.settled !== null && n > o.settled) local.delete(id)
      else map.set(id, o.task)
    }

    const today = todayKey()
    if (!sameTasks(map, s.tasks) || s.today !== today) {
      s.tasks = map
      s.today = today
      syncTaskLines(e)
    }
    revealIfAsked(e, docId)
  }

  // ---- What the editor tells us ----

  async function onMark(lines: { id: string; text: string }[]) {
    const docId = opts.docId()
    const day = todayKey()
    const tracked = lines.map((l) => track(l.id, { done: false, day }))
    const results = await Promise.allSettled(lines.map((l) =>
      $fetch('/api/tasks', { method: 'POST', body: { id: l.id, docId, text: l.text, day } }),
    ))
    let failed = 0
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        tracked[i]!.settle()
        return
      }
      failed++
      tracked[i]!.drop()
      const e = editor.value
      if (e && !e.isDestroyed) storageOf(e).tasks.delete(lines[i]!.id)
    })
    if (failed) {
      const e = editor.value
      if (e && !e.isDestroyed) refreshTaskLines(e)
      showError(failed === 1 ? 'Could not add the task. Try again.' : 'Could not add some tasks. Try again.')
    }
    if (failed < lines.length) void tasksChanged()
  }

  // Ticks of the same task are sent one after the other, so the last one wins.
  const queues = new Map<string, Promise<void>>()
  function onCheck(id: string, done: boolean) {
    const e = editor.value
    const now = e ? storageOf(e).tasks.get(id) : undefined
    const tracked = track(id, { day: now?.day ?? todayKey(), done })
    const run = async () => {
      try {
        await $fetch(`/api/tasks/${id}`, { method: 'PUT', body: { done } })
        tracked.settle()
        void tasksChanged()
      } catch {
        tracked.drop()
        showError('Could not save the task. Try again.')
        void load() // put the checkbox back the way the list has it
      }
    }
    const next = (queues.get(id) ?? Promise.resolve()).then(run)
    queues.set(id, next)
    void next.finally(() => { if (queues.get(id) === next) queues.delete(id) })
  }

  // ---- When to load ----

  watch(
    [editor, opts.docId, opts.enabled],
    ([e], [oldE, oldDocId]) => {
      if (!e) return
      const s = storageOf(e)
      s.onMark = (lines) => { void onMark(lines) }
      s.onCheck = onCheck
      // Another note: forget the old note's tasks right away.
      if (e !== oldE || opts.docId() !== oldDocId) {
        if (s.tasks.size) {
          s.tasks = new Map()
          refreshTaskLines(e)
        }
      }
      void load()
    },
    { immediate: true },
  )

  // A task changed somewhere else (Daily tasks, the pending popup, a note save).
  watch(tasksVersion, () => { void load() })

  // Back to this tab: the list may have changed in another tab ("Open note" opens a new tab).
  function onVisible() {
    if (document.visibilityState === 'visible') void load()
  }
  function onFocus() {
    void load()
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('focus', onFocus)
    if (errorTimer) clearTimeout(errorTimer)
  })

  return { error }
}
