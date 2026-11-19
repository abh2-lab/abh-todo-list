<script setup lang="ts">
import { useEditor, EditorContent, VueNodeViewRenderer, createDocument, type Editor } from '@tiptap/vue-3'
import { EditorState, TextSelection } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { TaskList, TaskItem } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Typography from '@tiptap/extension-typography'
import { Placeholder } from '@tiptap/extensions'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import ResizableMedia from './ResizableMedia.vue'
import type { TocHeading } from '~/types/editor'
import { TaskLines } from '~/lib/taskLines'
import { SafeLink } from '~/lib/safeLink'
import { LINK_REL, cleanNoteContent } from '#shared/noteContent'

const props = defineProps<{
  modelValue: Record<string, any>
  docId: string
  editable?: boolean
  /** Your own private note: lines can be marked as "Today's task". */
  taskMode?: boolean
  /** Goes up when the same note has a newer version (saved somewhere else): show it. */
  reloadKey?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [content: Record<string, any>]
  'update:tocHeadings': [headings: TocHeading[]]
  'save-status': [status: 'saved' | 'saving' | 'unsaved']
}>()

// Image extension with resize attributes and custom node view
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: { default: null, renderHTML: (a) => a.width ? { style: `width: ${a.width}` } : {} },
      height: { default: null, renderHTML: (a) => a.height ? { style: `height: ${a.height}` } : {} },
    }
  },
  addNodeView() {
    return VueNodeViewRenderer(ResizableMedia)
  },
})

let saveTimer: ReturnType<typeof setTimeout> | null = null

// A note can come from anyone (public notes): show only a cleaned copy (shared/noteContent.ts).
// Not a note yet (a new, empty one): start with an empty page.
function normalizeContent(c: Record<string, any> | null | undefined) {
  return cleanNoteContent(c) ?? ''
}

const editor = useEditor({
  content: normalizeContent(props.modelValue),
  editable: props.editable !== false,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4, 5, 6] },
      // Version 3 of the editor added these to StarterKit. They are off, so the editor works as before:
      link: false, // we have our own safe links (SafeLink, below)
      underline: false, // there is no underline in our notes
      // It would add an empty line at the end of some notes when you just click in them.
      // That is a save, and other people with the note open would get the "someone else saved" warning.
      trailingNode: false,
      listKeymap: false, // Backspace and Delete in lists work as before
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ResizableImage,
    Youtube.configure({ width: 640, height: 360 }),
    Typography,
    Placeholder.configure({ placeholder: 'Start writing…' }),
    Table.configure({ resizable: true, HTMLAttributes: { class: 'editor-table' } }),
    TableRow,
    TableHeader,
    TableCell,
    SafeLink.configure({
      openOnClick: false, // SafeLink opens links itself, safely
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        target: '_blank',
        rel: LINK_REL,
        class: 'editor-link',
      },
    }),
    TaskLines,
  ],
  editorProps: {
    handlePaste(view, event) {
      const items = Array.from(event.clipboardData?.items ?? [])
      const imageItem = items.find((item) => item.type.startsWith('image/'))
      if (!imageItem) return false

      event.preventDefault()
      const file = imageItem.getAsFile()
      if (!file) return false

      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        if (!src) return
        const node = view.state.schema.nodes.image?.create({ src })
        if (node) view.dispatch(view.state.tr.replaceSelectionWith(node))
      }
      reader.readAsDataURL(file)
      return true
    },
  },
  onCreate({ editor: e }) {
    buildToc(e)
  },
  onUpdate({ editor: e }) {
    const json = e.getJSON()
    emit('update:modelValue', json)
    emit('save-status', 'unsaved')
    buildToc(e)

    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => emit('save-status', 'saving'), 50)
  },
})

function buildToc(e: NonNullable<typeof editor.value>) {
  const headings: TocHeading[] = []
  e.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({ level: node.attrs.level as number, text: node.textContent, pos })
    }
  })
  emit('update:tocHeadings', headings)
}

const scroller = ref<HTMLElement | null>(null)

function scrollToPos(pos: number) {
  if (!editor.value) return
  const { node } = editor.value.view.domAtPos(pos + 1)
  const el = node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : (node as Text).parentElement
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

defineExpose({ scrollToPos, editor, scroller })

// false = don't send an "update": nothing in the note changed, so there is nothing to save.
watch(
  () => props.editable,
  (val) => editor.value?.setEditable(val !== false, false),
)

// ---- Undo and Redo: every note has its own ----
// One editor shows all notes. Each note we leave keeps its whole editor state while the page
// is open: its text, cursor and undo/redo list (and where it was scrolled to). Coming back to it,
// Undo and Redo go on where they were.
// Opening a note swaps the whole state. It is not a change in the note, so Undo can never
// bring back another note's text (that text would then be saved into this note).
const KEEP_NOTES = 20
const kept = new Map<string, { state: EditorState; scrollTop: number }>()

/** A new state for this content: no undo list yet, cursor at the start. */
function freshState(e: Editor, content: Record<string, any> | null | undefined): EditorState {
  const doc = createDocument(normalizeContent(content), e.schema, e.options.parseOptions)
  return EditorState.create({ doc, plugins: e.state.plugins })
}

function showState(e: Editor, state: EditorState, scrollTop: number) {
  e.view.updateState(state)
  // An empty step, so the toolbar and the rest see the new state. Nothing to undo, nothing to save.
  e.view.dispatch(e.view.state.tr.setMeta('addToHistory', false).setMeta('preventUpdate', true))
  void nextTick(() => {
    if (scroller.value) scroller.value.scrollTop = scrollTop
  })
}

// Show new content: another note was opened, or this note has a newer version.
watch(
  () => [props.docId, props.reloadKey] as const,
  ([docId], [oldDocId]) => {
    const e = editor.value
    if (!e || e.isDestroyed) return
    const next = freshState(e, props.modelValue)

    if (docId !== oldDocId) {
      // Keep the note we leave (the newest ones only, they can be big).
      kept.delete(oldDocId)
      kept.set(oldDocId, { state: e.state, scrollTop: scroller.value?.scrollTop ?? 0 })
      if (kept.size > KEEP_NOTES) kept.delete(kept.keys().next().value!)

      const back = kept.get(docId)
      kept.delete(docId)
      // Same text as on the server: go on where you were, with its undo list.
      // Changed somewhere else meanwhile: its undo list starts again, so the texts never mix.
      if (back && back.state.doc.eq(next.doc)) showState(e, back.state, back.scrollTop)
      else showState(e, next, 0)
    } else {
      // A newer version of this note (saved somewhere else). Its undo list starts again,
      // so Undo can't put the old text back over the new one. The cursor stays about where it was.
      const { from, to } = e.state.selection
      const end = next.doc.content.size
      const selection = TextSelection.between(next.doc.resolve(Math.min(from, end)), next.doc.resolve(Math.min(to, end)))
      showState(e, next.apply(next.tr.setSelection(selection)), scroller.value?.scrollTop ?? 0)
    }
    buildToc(e)
  },
)

// "Today's task" lines: tags, ticks and the link with the Daily tasks list.
const {
  error: taskError,
  menu: taskMenu,
  closeMenu: closeTaskMenu,
  moveTask,
  setDone,
  setCancelled,
  takeOff,
} = useLineTasks(editor, {
  docId: () => props.docId,
  enabled: () => !!props.taskMode,
})

/** A choice in the menu of a task line: do it, and close the menu. */
function onTaskMenu(run: (id: string) => void) {
  const id = taskMenu.value?.id
  closeTaskMenu()
  if (id) run(id)
}

// The menu stays where it opened: close it when the note scrolls or the window changes size.
function closeTaskMenuOnMove() {
  if (taskMenu.value) closeTaskMenu()
}
onMounted(() => {
  scroller.value?.addEventListener('scroll', closeTaskMenuOnMove, { passive: true })
  window.addEventListener('resize', closeTaskMenuOnMove)
})

onBeforeUnmount(() => {
  scroller.value?.removeEventListener('scroll', closeTaskMenuOnMove)
  window.removeEventListener('resize', closeTaskMenuOnMove)
  editor.value?.destroy()
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div ref="scroller" class="flex-1 overflow-y-auto min-h-0 editor-wrapper">
    <EditorContent :editor="editor" />

    <Teleport to="body">
      <Transition name="task-toast">
        <div
          v-if="taskError"
          class="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9995] max-w-[90vw] px-4 py-2.5 rounded-lg border border-[#ef4444]/40 bg-[#1a0808] text-sm text-[#fca5a5] shadow-2xl"
          role="alert"
        >
          {{ taskError }}
        </div>
      </Transition>

      <!-- The menu of a task line (from its tag) -->
      <TasksLineMenu
        v-if="taskMenu"
        :key="taskMenu.id"
        :task="taskMenu.task"
        :anchor="taskMenu.anchor"
        :today="todayKey()"
        :can-take-off="editable !== false"
        @close="closeTaskMenu"
        @move="(day: string) => onTaskMenu((id) => moveTask(id, day))"
        @done="(done: boolean) => onTaskMenu((id) => setDone(id, done))"
        @cancel="(cancelled: boolean) => onTaskMenu((id) => setCancelled(id, cancelled))"
        @take-off="onTaskMenu(takeOff)"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.task-toast-enter-active, .task-toast-leave-active { transition: opacity 0.18s ease; }
.task-toast-enter-from, .task-toast-leave-to { opacity: 0; }
</style>
