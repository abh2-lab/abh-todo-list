<script setup lang="ts">
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
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

// Show new content: another note was opened, or this note has a newer version.
watch(
  () => [props.docId, props.reloadKey] as const,
  ([docId], [oldDocId]) => {
    const e = editor.value
    if (!e) return
    // Same note: keep the cursor (or selection) about where it was.
    const keep = docId === oldDocId ? e.state.selection : null
    e.commands.setContent(normalizeContent(props.modelValue), false)
    if (keep) {
      const end = e.state.doc.content.size
      e.commands.setTextSelection({ from: Math.min(keep.from, end), to: Math.min(keep.to, end) })
    }
    buildToc(e)
  },
)

// "Today's task" lines: tags, ticks and the link with the Daily tasks list.
const { error: taskError } = useLineTasks(editor, {
  docId: () => props.docId,
  enabled: () => !!props.taskMode,
})

onBeforeUnmount(() => {
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
    </Teleport>
  </div>
</template>

<style scoped>
.task-toast-enter-active, .task-toast-leave-active { transition: opacity 0.18s ease; }
.task-toast-enter-from, .task-toast-leave-to { opacity: 0; }
</style>
