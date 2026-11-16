<script setup lang="ts">
import { BoldIcon, CalendarCheckIcon, CodeIcon, Grid2x2XIcon, ImageIcon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, ListTodoIcon, MinusIcon, PanelTopIcon, QuoteIcon, Redo2Icon, SquareCodeIcon, SquarePlayIcon, StrikethroughIcon, TableIcon, Undo2Icon, UnlinkIcon } from '@lucide/vue'
import { TableColumnDeleteIcon, TableColumnLeftIcon, TableColumnRightIcon, TableRowAboveIcon, TableRowBelowIcon, TableRowDeleteIcon } from '~/lib/tableIcons'
import type { Editor } from '@tiptap/vue-3'
import { isOnTaskLine } from '~/lib/taskLines'
import { youtubeSrc } from '#shared/noteContent'

const props = defineProps<{
  editor: Editor | null
  /** Your own private note: show the "Today's task" button. */
  taskMode?: boolean
}>()

const imageInput = ref<HTMLInputElement | null>(null)
const showYoutubeModal = ref(false)
const youtubeUrl = ref('')
const showLinkModal = ref(false)
const linkUrl = ref('')

function insertImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !props.editor) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    props.editor!.chain().focus().setImage({ src: ev.target!.result as string }).run()
  }
  reader.readAsDataURL(file)
  ;(e.target as HTMLInputElement).value = ''
}

function insertYoutube() {
  if (!props.editor || !youtubeUrl.value.trim()) return
  // With "https://" in front: without it the editor library fails to show the video.
  const src = youtubeSrc(youtubeUrl.value)
  if (src) props.editor.chain().focus().setYoutubeVideo({ src }).run()
  youtubeUrl.value = ''
  showYoutubeModal.value = false
}

function openLinkModal() {
  if (!props.editor) return
  linkUrl.value = (props.editor.getAttributes('link').href as string | undefined) ?? ''
  showLinkModal.value = true
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (
    trimmed.includes('://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return trimmed
  }
  return `https://${trimmed}`
}

function applyLink() {
  if (!props.editor) return
  const href = normalizeUrl(linkUrl.value)
  if (!href) {
    showLinkModal.value = false
    return
  }
  props.editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  linkUrl.value = ''
  showLinkModal.value = false
}

function removeLink() {
  if (!props.editor) return
  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
}

type BtnDef = {
  label: string
  title: string
  icon: string
  action: () => void
  active?: () => boolean
}

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

const buttons = computed<BtnDef[]>(() => {
  const e = props.editor
  if (!e) return []
  return ([1, 2, 3, 4, 5, 6] as HeadingLevel[]).map((level) => ({
    label: `H${level}`,
    title: `Heading ${level}`,
    icon: `H${level}`,
    action: () => e.chain().focus().toggleHeading({ level }).run(),
    active: () => e.isActive('heading', { level }),
  }))
})
</script>

<template>
  <div data-tour="toolbar" class="flex items-center gap-0.5 px-3 py-1.5 border-b border-[#1f1f1f] bg-[#0a0a0a] flex-wrap shrink-0 z-10">
    <!-- Heading buttons -->
    <template v-if="editor">
      <button
        v-for="btn in buttons"
        :key="btn.label"
        :title="btn.title"
        class="toolbar-btn font-mono text-xs font-bold"
        :class="{ 'active': btn.active?.() }"
        @click="btn.action()"
      >
        {{ btn.label }}
      </button>

      <div class="toolbar-sep" />

      <!-- Bold -->
      <button title="Bold (Ctrl+B)" class="toolbar-btn" :class="{ active: editor.isActive('bold') }" @click="editor.chain().focus().toggleBold().run()">
        <BoldIcon :size="18" />
      </button>

      <!-- Italic -->
      <button title="Italic (Ctrl+I)" class="toolbar-btn" :class="{ active: editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()">
        <ItalicIcon :size="18" />
      </button>

      <!-- Strikethrough -->
      <button title="Strikethrough" class="toolbar-btn" :class="{ active: editor.isActive('strike') }" @click="editor.chain().focus().toggleStrike().run()">
        <StrikethroughIcon :size="18" />
      </button>

      <!-- Inline code -->
      <button title="Inline Code" class="toolbar-btn" :class="{ active: editor.isActive('code') }" @click="editor.chain().focus().toggleCode().run()">
        <CodeIcon :size="18" />
      </button>

      <div class="toolbar-sep" />

      <!-- Bullet list -->
      <button title="Bullet List" class="toolbar-btn" :class="{ active: editor.isActive('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()">
        <ListIcon :size="18" />
      </button>

      <!-- Ordered list -->
      <button title="Numbered List" class="toolbar-btn" :class="{ active: editor.isActive('orderedList') }" @click="editor.chain().focus().toggleOrderedList().run()">
        <ListOrderedIcon :size="18" />
      </button>

      <!-- Task list -->
      <button title="Checklist" class="toolbar-btn" :class="{ active: editor.isActive('taskList') }" @click="editor.chain().focus().toggleTaskList().run()">
        <ListTodoIcon :size="18" />
      </button>

      <!-- Today's task: put this line in today's Daily tasks list (click again to take it off) -->
      <button
        v-if="taskMode"
        data-tour="today-task"
        :title="isOnTaskLine(editor) ? 'Take this line off the Daily tasks list' : 'Today\'s task: add this line to today\'s Daily tasks list'"
        class="toolbar-btn toolbar-btn-label"
        :class="{ active: isOnTaskLine(editor) }"
        :disabled="!editor.can().toggleTodayTask()"
        @click="editor.chain().focus().toggleTodayTask().run()"
      >
        <CalendarCheckIcon :size="18" />
        <span class="hidden sm:inline text-xs whitespace-nowrap">Today's task</span>
      </button>

      <div class="toolbar-sep" />

      <!-- Blockquote -->
      <button title="Blockquote" class="toolbar-btn" :class="{ active: editor.isActive('blockquote') }" @click="editor.chain().focus().toggleBlockquote().run()">
        <QuoteIcon :size="18" />
      </button>

      <!-- Code block -->
      <button title="Code Block" class="toolbar-btn" :class="{ active: editor.isActive('codeBlock') }" @click="editor.chain().focus().toggleCodeBlock().run()">
        <SquareCodeIcon :size="18" />
      </button>

      <!-- Horizontal rule -->
      <button title="Divider" class="toolbar-btn" @click="editor.chain().focus().setHorizontalRule().run()">
        <MinusIcon :size="18" />
      </button>

      <div class="toolbar-sep" />

      <!-- Insert image -->
      <button title="Insert Image" class="toolbar-btn" @click="imageInput?.click()">
        <ImageIcon :size="18" />
      </button>
      <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="insertImage" />

      <!-- Insert YouTube -->
      <button title="Insert YouTube Video" class="toolbar-btn" @click="showYoutubeModal = true">
        <SquarePlayIcon :size="18" />
      </button>

      <div class="toolbar-sep" />

      <!-- Add / Edit Link -->
      <button title="Add / Edit Link" class="toolbar-btn" :class="{ active: editor.isActive('link') }" @click="openLinkModal">
        <LinkIcon :size="18" />
      </button>

      <!-- Remove Link (contextual) -->
      <button v-if="editor.isActive('link')" title="Remove Link" class="toolbar-btn" @click="removeLink">
        <UnlinkIcon :size="18" />
      </button>

      <!-- Insert Table -->
      <button title="Insert Table" class="toolbar-btn" @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()">
        <TableIcon :size="18" />
      </button>

      <!-- Contextual table controls -->
      <template v-if="editor.isActive('table')">
        <div class="toolbar-sep" />

        <!-- Add Row Above -->
        <button title="Add Row Above" class="toolbar-btn" :disabled="!editor.can().addRowBefore()" @click="editor.chain().focus().addRowBefore().run()">
          <TableRowAboveIcon :size="18" />
        </button>

        <!-- Add Row Below -->
        <button title="Add Row Below" class="toolbar-btn" :disabled="!editor.can().addRowAfter()" @click="editor.chain().focus().addRowAfter().run()">
          <TableRowBelowIcon :size="18" />
        </button>

        <!-- Add Column Left -->
        <button title="Add Column Left" class="toolbar-btn" :disabled="!editor.can().addColumnBefore()" @click="editor.chain().focus().addColumnBefore().run()">
          <TableColumnLeftIcon :size="18" />
        </button>

        <!-- Add Column Right -->
        <button title="Add Column Right" class="toolbar-btn" :disabled="!editor.can().addColumnAfter()" @click="editor.chain().focus().addColumnAfter().run()">
          <TableColumnRightIcon :size="18" />
        </button>

        <!-- Delete Row -->
        <button title="Delete Row" class="toolbar-btn" :disabled="!editor.can().deleteRow()" @click="editor.chain().focus().deleteRow().run()">
          <TableRowDeleteIcon :size="18" />
        </button>

        <!-- Delete Column -->
        <button title="Delete Column" class="toolbar-btn" :disabled="!editor.can().deleteColumn()" @click="editor.chain().focus().deleteColumn().run()">
          <TableColumnDeleteIcon :size="18" />
        </button>

        <!-- Toggle Header Row -->
        <button title="Toggle Header Row" class="toolbar-btn" :class="{ active: editor.isActive('tableHeader') }" @click="editor.chain().focus().toggleHeaderRow().run()">
          <PanelTopIcon :size="18" />
        </button>

        <!-- Delete Table -->
        <button title="Delete Table" class="toolbar-btn" @click="editor.chain().focus().deleteTable().run()">
          <Grid2x2XIcon :size="18" />
        </button>
      </template>

      <div class="flex-1" />

      <!-- Undo -->
      <button title="Undo (Ctrl+Z)" class="toolbar-btn" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">
        <Undo2Icon :size="18" />
      </button>

      <!-- Redo -->
      <button title="Redo (Ctrl+Shift+Z)" class="toolbar-btn" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">
        <Redo2Icon :size="18" />
      </button>
    </template>
  </div>

  <!-- YouTube modal -->
  <Teleport to="body">
    <div
      v-if="showYoutubeModal"
      class="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center"
      @click.self="showYoutubeModal = false"
    >
      <div class="bg-[#111] border border-[#1f1f1f] rounded-xl p-5 w-[90vw] max-w-sm shadow-2xl">
        <h3 class="text-sm font-medium text-[#f0f0f0] mb-3">Insert YouTube Video</h3>
        <input
          v-model="youtubeUrl"
          class="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#444] outline-none focus:border-[#6366f1] transition-colors"
          placeholder="https://www.youtube.com/watch?v=..."
          @keydown.enter="insertYoutube"
          @keydown.escape="showYoutubeModal = false"
        />
        <div class="flex justify-end gap-2 mt-3">
          <button class="text-btn text-[#666] hover:text-[#999] px-3 py-1.5 rounded" @click="showYoutubeModal = false">Cancel</button>
          <button class="text-btn bg-[#6366f1] hover:bg-[#4f46e5] text-white px-3 py-1.5 rounded transition-colors" @click="insertYoutube">Insert</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Link modal -->
  <Teleport to="body">
    <div
      v-if="showLinkModal"
      class="fixed inset-0 z-[9998] bg-black/70 flex items-center justify-center"
      @click.self="showLinkModal = false"
    >
      <div class="bg-[#111] border border-[#1f1f1f] rounded-xl p-5 w-[90vw] max-w-sm shadow-2xl">
        <h3 class="text-sm font-medium text-[#f0f0f0] mb-3">Insert / Edit Link</h3>
        <input
          v-model="linkUrl"
          autofocus
          class="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#444] outline-none focus:border-[#6366f1] transition-colors"
          placeholder="https://..."
          @keydown.enter="applyLink"
          @keydown.escape="showLinkModal = false"
        />
        <div class="flex justify-end gap-2 mt-3">
          <button class="text-btn text-[#666] hover:text-[#999] px-3 py-1.5 rounded" @click="showLinkModal = false">Cancel</button>
          <button class="text-btn bg-[#6366f1] hover:bg-[#4f46e5] text-white px-3 py-1.5 rounded transition-colors" @click="applyLink">Apply</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.toolbar-btn {
  @apply flex items-center justify-center w-8 h-8 rounded text-[#666] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed;
}
.toolbar-btn.active {
  @apply text-[#6366f1] bg-[#1a1a2e];
}
/* A button with a word next to its icon (the word shows on wider screens). */
@media (min-width: 640px) {
  .toolbar-btn.toolbar-btn-label {
    @apply w-auto px-2 gap-1.5;
  }
}
.toolbar-sep {
  @apply w-px h-4 bg-[#1f1f1f] mx-1;
}
</style>
