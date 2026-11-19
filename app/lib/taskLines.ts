// "Today's task" lines in a note.
//
// A line (a paragraph, a bullet or a checklist line) becomes a task when it gets a task id.
// The same id is the task's id in the Daily tasks list, so the two stay linked:
// - editing the line's text changes the task text (its done / day stay the same),
// - ticking a checklist line marks the task done, and the other way round,
// - the line shows a small tag: "Task · today", "Task · done", "Task · cancelled", ...
//   Clicking (or tapping) the tag opens a menu: move to today or another day, done, cancel, ...
//
// The editor only knows the tasks of the open note (storage.tasks). The code that talks to
// the server (useLineTasks) fills that map and gets told when lines are marked or ticked.
// (@tiptap/vue-3 gives us everything from @tiptap/core; only the core Editor type comes from there.)
import type { Editor } from '@tiptap/core'
import { Extension } from '@tiptap/vue-3'
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { shortDay, todayKey } from '~/utils/days'

/** What the editor knows about a task line. */
export interface LineTask {
  done: boolean
  /** The day it is planned for, like 2026-11-09. */
  day: string
  /** The person decided not to do it. */
  cancelled?: boolean
  /** A done task took this many days (2 or more: the tag says "done in 3 days"). */
  took?: number | null
}

export interface TaskLinesStorage {
  /** Lines can be marked only in your own private notes. */
  enabled: boolean
  /** Task id → task, for the open note. */
  tasks: Map<string, LineTask>
  /** Today, like 2026-11-09, in local time. */
  today: string
  /** A line to light up for a moment (after "Open note" in the list). */
  flashId: string | null
  /** New task lines were marked (always for today). */
  onMark: ((lines: { id: string; text: string }[]) => void) | null
  /** A checklist task line was ticked or unticked. */
  onCheck: ((id: string, done: boolean) => void) | null
  /** The tag of a task line was clicked: open its menu next to the tag. */
  onTagClick: ((id: string, tag: HTMLElement) => void) | null
  /** "Move to today" (toolbar button) for these tasks. */
  onMoveToToday: ((ids: string[]) => void) | null
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    taskLines: {
      /** Mark the line(s) at the cursor as today's task, or take the mark off. */
      toggleTodayTask: () => ReturnType
      /** The line(s) at the cursor are tasks of an earlier day, not done: move them to today. */
      moveTasksToToday: () => ReturnType
    }
  }
  /** editor.storage.taskLines */
  interface Storage {
    taskLines: TaskLinesStorage
  }
}

export const taskLinesKey = new PluginKey<DecorationSet>('taskLines')
/** Set on changes we make ourselves (ticking boxes to match the list), so we don't send them back. */
const SYNC = 'taskLinesSync'

const ITEM_TYPES = ['listItem', 'taskItem']
const LINE_TYPES = ['paragraph', ...ITEM_TYPES]
/** Plain lines can be tasks at the top level or inside a quote (not inside tables). */
const PARAGRAPH_PARENTS = ['doc', 'blockquote']

/** A new task id. randomUUID needs https (or localhost), so there is a fallback. */
function newTaskId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** The text of a line, as the task list shows it. A list item's line is its first paragraph. */
export function lineText(node: PMNode): string {
  const own = node.type.name === 'paragraph' ? node : node.firstChild
  if (!own) return ''
  return own.textBetween(0, own.content.size, ' ', ' ').replace(/\s+/g, ' ').trim().slice(0, 500)
}

interface Line {
  node: PMNode
  pos: number
}

/** The lines the cursor or the selection is on. */
function linesInSelection(state: EditorState): Line[] {
  const { from, to } = state.selection
  const lines: Line[] = []
  state.doc.nodesBetween(from, to, (node, pos, parent) => {
    const type = node.type.name
    if (ITEM_TYPES.includes(type)) {
      // A list item counts only when the cursor is on its own first line, not in a list inside it.
      const first = node.firstChild
      if (first?.type.name === 'paragraph') {
        const start = pos + 1
        const end = start + first.nodeSize
        if (from < end && to > start) lines.push({ node, pos })
      }
      return true
    }
    if (type === 'paragraph') {
      if (parent && PARAGRAPH_PARENTS.includes(parent.type.name)) lines.push({ node, pos })
      return false
    }
    return true
  })
  return lines
}

function storageOf(editor: Editor): TaskLinesStorage {
  return editor.storage.taskLines as TaskLinesStorage
}

function isTask(node: PMNode, storage: TaskLinesStorage): boolean {
  const id = node.attrs.taskId as string | null | undefined
  return !!id && storage.tasks.has(id)
}

/** Is the cursor on a task line? (lights up the toolbar button) */
export function isOnTaskLine(editor: Editor): boolean {
  const storage = storageOf(editor)
  if (!storage?.enabled) return false
  const lines = linesInSelection(editor.state)
  return lines.length > 0 && lines.every((l) => isTask(l.node, storage))
}

/** done, cancelled, late (an earlier day, not done), today, or later (a day still to come). */
export type LineState = 'done' | 'cancelled' | 'late' | 'today' | 'later'

export function lineState(task: LineTask, today: string): LineState {
  if (task.done) return 'done'
  if (task.cancelled) return 'cancelled'
  return task.day < today ? 'late' : task.day === today ? 'today' : 'later'
}

/**
 * The cursor is on task lines of an earlier day that are not done (the tag says "Task · not done"):
 * their ids. Then the toolbar button says "Move to today". Otherwise: no ids.
 */
export function lateTasksAtCursor(editor: Editor): string[] {
  const storage = storageOf(editor)
  if (!storage?.enabled) return []
  const today = storage.today || todayKey()
  const ids: string[] = []
  for (const l of linesInSelection(editor.state)) {
    const id = l.node.attrs.taskId as string | null | undefined
    const task = id ? storage.tasks.get(id) : undefined
    if (!id || !task || lineState(task, today) !== 'late') return []
    ids.push(id)
  }
  return ids
}

/** Take the line with this task id off the Daily tasks list (the text stays). Undo brings it back. */
export function takeLineOffList(editor: Editor, id: string): boolean {
  if (editor.isDestroyed) return false
  const { state } = editor.view
  let found: { node: PMNode; pos: number } | null = null
  state.doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs.taskId === id && LINE_TYPES.includes(node.type.name)) {
      found = { node, pos }
      return false
    }
    return true
  })
  if (!found) return false
  const { node, pos } = found as { node: PMNode; pos: number }
  editor.view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, taskId: null }))
  return true
}

function tagText(task: LineTask, state: LineState): string {
  switch (state) {
    case 'done': return task.took && task.took > 1 ? `Task · done in ${task.took} days` : 'Task · done'
    case 'cancelled': return 'Task · cancelled'
    case 'late': return 'Task · not done'
    case 'today': return 'Task · today'
    default: return `Task · ${shortDay(task.day)}`
  }
}

// A small "open" arrow in the tag (Lucide chevron-down).
const CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>'

/** The tag after a task line: a small button that opens the task's menu. */
function tagButton(id: string, state: LineState, text: string, storage: TaskLinesStorage) {
  return () => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = `task-tag task-tag-${state}`
    el.contentEditable = 'false'
    el.title = 'Task options'
    el.setAttribute('aria-haspopup', 'menu')
    el.append(text)
    el.insertAdjacentHTML('beforeend', CHEVRON)
    // Keep the cursor where it is: the click is for the menu, not for the text.
    el.addEventListener('mousedown', (e) => e.preventDefault())
    el.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      storage.onTagClick?.(id, el)
    })
    return el
  }
}

function buildTags(doc: PMNode, storage: TaskLinesStorage): DecorationSet {
  if (!storage.enabled || storage.tasks.size === 0) return DecorationSet.empty
  const today = storage.today || todayKey()
  const decorations: Decoration[] = []
  doc.descendants((node, pos) => {
    const id = node.attrs.taskId as string | null | undefined
    const task = id ? storage.tasks.get(id) : undefined
    if (!id || !task || !LINE_TYPES.includes(node.type.name)) return true

    const state = lineState(task, today)
    const tag = tagText(task, state)

    // The tag sits after the line's own text (for list items: their first paragraph).
    const target = node.type.name === 'paragraph'
      ? { node, pos }
      : node.firstChild?.type.name === 'paragraph'
        ? { node: node.firstChild, pos: pos + 1 }
        : null
    if (target) {
      decorations.push(Decoration.node(target.pos, target.pos + target.node.nodeSize, {
        class: `task-line task-${state}${storage.flashId === id ? ' task-flash' : ''}`,
      }))
      // Not on an empty line: there the cursor would have no text to sit next to.
      if (target.node.content.size > 0) {
        const end = target.pos + target.node.nodeSize - 1
        decorations.push(Decoration.widget(end, tagButton(id, state, tag, storage), {
          side: 1, // after the text: typing at the end of the line goes before the tag
          key: `task-tag:${id}:${state}:${tag}`,
          ignoreSelection: true,
          stopEvent: () => true, // the editor leaves clicks on the tag alone
        }))
      }
    }
    return true
  })
  return DecorationSet.create(doc, decorations)
}

/** Checklist task lines of a doc: task id → ticked or not. */
function tickedTaskLines(doc: PMNode, storage: TaskLinesStorage): Map<string, boolean> {
  const out = new Map<string, boolean>()
  doc.descendants((node) => {
    if (node.type.name === 'taskItem') {
      const id = node.attrs.taskId as string | null
      if (id && storage.tasks.has(id) && !out.has(id)) out.set(id, !!node.attrs.checked)
    }
    return true
  })
  return out
}

/** Pasted content: drop task ids that are not tasks of this note (for example copied from another note). */
function keepOwnTaskIds(fragment: Fragment, own: Map<string, LineTask>): Fragment {
  let changed = false
  const nodes: PMNode[] = []
  fragment.forEach((node) => {
    let next = node
    if (!node.isText && node.childCount > 0) {
      const inner = keepOwnTaskIds(node.content, own)
      if (inner !== node.content) next = node.copy(inner)
    }
    const id = next.attrs.taskId as string | null | undefined
    if (id && !own.has(id)) next = next.type.create({ ...next.attrs, taskId: null }, next.content, next.marks)
    if (next !== node) changed = true
    nodes.push(next)
  })
  return changed ? Fragment.fromArray(nodes) : fragment
}

export const TaskLines = Extension.create<object, TaskLinesStorage>({
  name: 'taskLines',
  // Our Enter key must run before the list's own Enter key.
  priority: 1000,

  addStorage() {
    return {
      enabled: false,
      tasks: new Map(),
      today: '',
      flashId: null,
      onMark: null,
      onCheck: null,
      onTagClick: null,
      onMoveToToday: null,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: LINE_TYPES,
        attributes: {
          taskId: {
            default: null,
            // Enter at the end of a task line starts a new, normal line.
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-task-id'),
            renderHTML: (attrs) => (attrs.taskId ? { 'data-task-id': attrs.taskId } : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      toggleTodayTask: () => ({ state, tr, dispatch }) => {
        const storage = this.storage
        if (!storage.enabled) return false
        const lines = linesInSelection(state)
        if (lines.length === 0) return false

        // All lines are tasks already: take the mark off. The text stays in the note.
        // The task leaves the list when the note saves (Undo brings it back).
        if (lines.every((l) => isTask(l.node, storage))) {
          if (dispatch) {
            for (const l of lines) tr.setNodeMarkup(l.pos, undefined, { ...l.node.attrs, taskId: null })
          }
          return true
        }

        // Mark the lines that are not tasks yet. Empty lines are skipped. New tasks are always for today.
        const toMark = lines.filter((l) => !isTask(l.node, storage) && lineText(l.node))
        if (toMark.length === 0) return false
        if (dispatch) {
          const day = todayKey()
          const made = toMark.map((l) => {
            const id = newTaskId()
            tr.setNodeMarkup(l.pos, undefined, { ...l.node.attrs, taskId: id })
            storage.tasks.set(id, { done: false, day })
            return { id, text: lineText(l.node) }
          })
          queueMicrotask(() => storage.onMark?.(made))
        }
        return true
      },

      moveTasksToToday: () => ({ editor, dispatch }) => {
        const ids = lateTasksAtCursor(editor)
        if (ids.length === 0) return false
        // Only the day changes (in the list); the note stays the same.
        if (dispatch) queueMicrotask(() => this.storage.onMoveToToday?.(ids))
        return true
      },
    }
  },

  addKeyboardShortcuts() {
    return {
      // Enter at the very start of a task line: add an empty line above it.
      // (Without this, the empty line above would keep the task and the text would lose it.)
      Enter: ({ editor }) => {
        const storage = this.storage
        if (!storage.enabled || storage.tasks.size === 0) return false
        const { state } = editor.view
        const { selection } = state
        if (!selection.empty) return false
        const { $from } = selection
        const paragraph = $from.parent
        if (paragraph.type.name !== 'paragraph' || $from.parentOffset !== 0 || paragraph.content.size === 0) return false
        const depth = $from.depth
        if (depth < 1) return false

        const parent = $from.node(depth - 1)
        let lineDepth: number
        if (ITEM_TYPES.includes(parent.type.name) && $from.index(depth - 1) === 0) lineDepth = depth - 1
        else if (PARAGRAPH_PARENTS.includes(parent.type.name)) lineDepth = depth
        else return false

        const line = $from.node(lineDepth)
        if (!isTask(line, storage)) return false
        const paragraphType = state.schema.nodes.paragraph
        if (!paragraphType) return false
        const blank = line.type.name === 'paragraph'
          ? paragraphType.create()
          : line.type.create(null, paragraphType.create())
        editor.view.dispatch(state.tr.insert($from.before(lineDepth), blank).scrollIntoView())
        return true
      },
    }
  },

  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin<DecorationSet>({
        key: taskLinesKey,
        state: {
          init: (_, state) => buildTags(state.doc, storage),
          apply: (tr, old) => (tr.docChanged || tr.getMeta(taskLinesKey) ? buildTags(tr.doc, storage) : old),
        },
        props: {
          decorations: (state) => taskLinesKey.getState(state),
          transformPasted: (slice) => {
            const content = keepOwnTaskIds(slice.content, storage.tasks)
            return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd)
          },
        },
        // Copy + paste inside the note can make two lines with the same task id. Keep the first.
        appendTransaction: (transactions, _old, state) => {
          if (!transactions.some((t) => t.docChanged)) return null
          const seen = new Set<string>()
          let fix: Transaction | null = null
          state.doc.descendants((node, pos) => {
            const id = node.attrs.taskId as string | null | undefined
            if (!id) return true
            if (seen.has(id)) {
              fix ??= state.tr
              fix.setNodeMarkup(pos, undefined, { ...node.attrs, taskId: null })
            } else {
              seen.add(id)
            }
            return true
          })
          return fix
        },
      }),
    ]
  },

  // Ticking (or unticking) a checklist task line marks the task done (or not done) in the list.
  onTransaction({ editor, transaction }) {
    const storage = this.storage
    if (!transaction.docChanged || transaction.getMeta('preventUpdate')) return
    if (transaction.getMeta(SYNC) || !storage.enabled || storage.tasks.size === 0) return
    const before = tickedTaskLines(transaction.before, storage)
    if (before.size === 0) return
    const after = tickedTaskLines(editor.view.state.doc, storage)
    let changed = false
    for (const [id, ticked] of after) {
      const task = storage.tasks.get(id)
      if (!task || !before.has(id) || before.get(id) === ticked) continue
      // Ticked = done, and done takes the cancel off. How many days it took comes with the next load.
      storage.tasks.set(id, { ...task, done: ticked, cancelled: ticked ? false : task.cancelled, took: null })
      changed = true
      storage.onCheck?.(id, ticked)
    }
    // Redraw the tags ("Task · done"), after this update is finished.
    if (changed) queueMicrotask(() => refreshTaskLines(editor))
  },
})

// ---- Helpers for the code that talks to the server ----

/** Redraw the tags (after the tasks of the note changed). */
export function refreshTaskLines(editor: Editor) {
  if (editor.isDestroyed) return
  editor.view.dispatch(editor.view.state.tr.setMeta(taskLinesKey, true).setMeta('addToHistory', false))
}

/** Tick the checklist task lines that are done in the list (and untick the others), then redraw the tags. */
export function syncTaskLines(editor: Editor) {
  if (editor.isDestroyed) return
  const storage = storageOf(editor)
  const { state } = editor.view
  const tr = state.tr
  if (storage.enabled) {
    state.doc.descendants((node, pos) => {
      if (node.type.name !== 'taskItem') return true
      const task = storage.tasks.get(node.attrs.taskId as string)
      if (task && node.attrs.checked !== task.done) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: task.done })
      }
      return true
    })
  }
  editor.view.dispatch(tr.setMeta(taskLinesKey, true).setMeta(SYNC, true).setMeta('addToHistory', false))
}

/** Scroll to a task line and light it up for a moment. False if the line is not in this note. */
export function revealTaskLine(editor: Editor, id: string): boolean {
  if (editor.isDestroyed) return false
  let found = -1
  editor.view.state.doc.descendants((node, pos) => {
    if (found >= 0) return false
    if (node.attrs.taskId === id && LINE_TYPES.includes(node.type.name)) {
      found = pos
      return false
    }
    return true
  })
  if (found < 0) return false

  // A plain jump (a smooth scroll does not run while the window is not being drawn).
  const dom = editor.view.nodeDOM(found)
  if (dom instanceof HTMLElement) dom.scrollIntoView({ block: 'center' })

  const storage = storageOf(editor)
  storage.flashId = id
  refreshTaskLines(editor)
  setTimeout(() => {
    if (storage.flashId !== id) return
    storage.flashId = null
    refreshTaskLines(editor)
  }, 2500)
  return true
}
