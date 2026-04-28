<script setup lang="ts">
import { useEditor, EditorContent, VueNodeViewRenderer } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import Typography from '@tiptap/extension-typography'
import Placeholder from '@tiptap/extension-placeholder'
import ResizableMedia from './ResizableMedia.vue'
import type { TocHeading } from '~/types/editor'

const props = defineProps<{
  modelValue: Record<string, any>
  docId: string
  editable?: boolean
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

const editor = useEditor({
  content: props.modelValue,
  editable: props.editable !== false,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ResizableImage,
    Youtube.configure({ width: 640, height: 360 }),
    Typography,
    Placeholder.configure({ placeholder: 'Start writing…' }),
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

function scrollToPos(pos: number) {
  if (!editor.value) return
  const { node } = editor.value.view.domAtPos(pos + 1)
  const el = node.nodeType === Node.ELEMENT_NODE
    ? (node as HTMLElement)
    : (node as Text).parentElement
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

defineExpose({ scrollToPos, editor })

watch(
  () => props.editable,
  (val) => editor.value?.setEditable(val !== false),
)

// Sync external content changes (document switch)
watch(
  () => props.docId,
  () => {
    if (editor.value) {
      editor.value.commands.setContent(props.modelValue, false)
      buildToc(editor.value)
    }
  },
)

onBeforeUnmount(() => {
  editor.value?.destroy()
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <div class="flex-1 overflow-y-auto min-h-0 editor-wrapper">
    <EditorContent :editor="editor" />
  </div>
</template>
