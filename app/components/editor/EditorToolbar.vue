<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'

const props = defineProps<{ editor: Editor | null }>()

const imageInput = ref<HTMLInputElement | null>(null)
const showYoutubeModal = ref(false)
const youtubeUrl = ref('')

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
  props.editor.chain().focus().setYoutubeVideo({ src: youtubeUrl.value.trim() }).run()
  youtubeUrl.value = ''
  showYoutubeModal.value = false
}

type BtnDef = {
  label: string
  title: string
  icon: string
  action: () => void
  active?: () => boolean
}

const buttons = computed<BtnDef[]>(() => {
  const e = props.editor
  if (!e) return []
  return [
    {
      label: 'H1', title: 'Heading 1',
      icon: 'H1',
      action: () => e.chain().focus().toggleHeading({ level: 1 }).run(),
      active: () => e.isActive('heading', { level: 1 }),
    },
    {
      label: 'H2', title: 'Heading 2',
      icon: 'H2',
      action: () => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: () => e.isActive('heading', { level: 2 }),
    },
    {
      label: 'H3', title: 'Heading 3',
      icon: 'H3',
      action: () => e.chain().focus().toggleHeading({ level: 3 }).run(),
      active: () => e.isActive('heading', { level: 3 }),
    },
    {
      label: 'H4', title: 'Heading 4',
      icon: 'H4',
      action: () => e.chain().focus().toggleHeading({ level: 4 }).run(),
      active: () => e.isActive('heading', { level: 4 }),
    },
  ]
})
</script>

<template>
  <div class="flex items-center gap-0.5 px-3 py-1.5 border-b border-[#1f1f1f] bg-[#0a0a0a] flex-wrap shrink-0 z-10">
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
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 3h4a2.5 2.5 0 010 5H4V3zM4 8h4.5a2.5 2.5 0 010 5H4V8z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>
      </button>

      <!-- Italic -->
      <button title="Italic (Ctrl+I)" class="toolbar-btn" :class="{ active: editor.isActive('italic') }" @click="editor.chain().focus().toggleItalic().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2H6M8 12H5M7.5 2l-3 10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>

      <!-- Strikethrough -->
      <button title="Strikethrough" class="toolbar-btn" :class="{ active: editor.isActive('strike') }" @click="editor.chain().focus().toggleStrike().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7h8M5 4a2 2 0 014 0c0 1-1 1.5-2 2M5 10a2 2 0 004 0c0-1-1-1.5-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>

      <!-- Inline code -->
      <button title="Inline Code" class="toolbar-btn" :class="{ active: editor.isActive('code') }" @click="editor.chain().focus().toggleCode().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 4L2 7l3 3M9 4l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <div class="toolbar-sep" />

      <!-- Bullet list -->
      <button title="Bullet List" class="toolbar-btn" :class="{ active: editor.isActive('bulletList') }" @click="editor.chain().focus().toggleBulletList().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="2.5" cy="4" r="1" fill="currentColor"/><circle cx="2.5" cy="7" r="1" fill="currentColor"/><circle cx="2.5" cy="10" r="1" fill="currentColor"/><path d="M5 4h7M5 7h7M5 10h7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>

      <!-- Ordered list -->
      <button title="Numbered List" class="toolbar-btn" :class="{ active: editor.isActive('orderedList') }" @click="editor.chain().focus().toggleOrderedList().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1.5 3h1.2M2.7 3V6M1.5 6h1.2M1.5 7h1.2l-1.2 2.5h1.2M1.5 11.5h1.2" stroke="currentColor" stroke-width="1" stroke-linecap="round"/><path d="M6 4h6M6 7h6M6 10.5h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>

      <!-- Task list -->
      <button title="Checklist" class="toolbar-btn" :class="{ active: editor.isActive('taskList') }" @click="editor.chain().focus().toggleTaskList().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="3" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2"/><path d="M2 4.5l.8.8 1.6-1.6" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><rect x="1.5" y="8.5" width="3" height="3" rx="0.5" stroke="currentColor" stroke-width="1.2"/><path d="M6 4.5h6M6 10h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>

      <div class="toolbar-sep" />

      <!-- Blockquote -->
      <button title="Blockquote" class="toolbar-btn" :class="{ active: editor.isActive('blockquote') }" @click="editor.chain().focus().toggleBlockquote().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4c0 2 1 3 2 3M7 4c0 2 1 3 2 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M2 11h1.5M7 11H8.5" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>
      </button>

      <!-- Code block -->
      <button title="Code Block" class="toolbar-btn" :class="{ active: editor.isActive('codeBlock') }" @click="editor.chain().focus().toggleCodeBlock().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 5.5L3 7l2 1.5M9 5.5L11 7l-2 1.5M6.5 5l1 4" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>

      <!-- Horizontal rule -->
      <button title="Divider" class="toolbar-btn" @click="editor.chain().focus().setHorizontalRule().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>

      <div class="toolbar-sep" />

      <!-- Insert image -->
      <button title="Insert Image" class="toolbar-btn" @click="imageInput?.click()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.2"/><circle cx="4.5" cy="5.5" r="1" fill="currentColor"/><path d="M1 10l3.5-3.5 2.5 2.5 2-2L13 11" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="insertImage" />

      <!-- Insert YouTube -->
      <button title="Insert YouTube Video" class="toolbar-btn" @click="showYoutubeModal = true">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/><path d="M6 5.5l3 1.5-3 1.5V5.5z" fill="currentColor"/></svg>
      </button>

      <div class="flex-1" />

      <!-- Undo -->
      <button title="Undo (Ctrl+Z)" class="toolbar-btn" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 5.5h6a3.5 3.5 0 010 7H4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M4.5 3L2 5.5l2.5 2.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Redo -->
      <button title="Redo (Ctrl+Shift+Z)" class="toolbar-btn" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M12 5.5H6a3.5 3.5 0 000 7h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9.5 3L12 5.5 9.5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
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
      <div class="bg-[#111] border border-[#1f1f1f] rounded-xl p-5 w-80 shadow-2xl">
        <h3 class="text-sm font-medium text-[#f0f0f0] mb-3">Insert YouTube Video</h3>
        <input
          v-model="youtubeUrl"
          class="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2 text-sm text-[#f0f0f0] placeholder-[#444] outline-none focus:border-[#6366f1] transition-colors"
          placeholder="https://www.youtube.com/watch?v=..."
          @keydown.enter="insertYoutube"
          @keydown.escape="showYoutubeModal = false"
        />
        <div class="flex justify-end gap-2 mt-3">
          <button class="text-xs text-[#666] hover:text-[#999] px-3 py-1.5 rounded" @click="showYoutubeModal = false">Cancel</button>
          <button class="text-xs bg-[#6366f1] hover:bg-[#4f46e5] text-white px-3 py-1.5 rounded transition-colors" @click="insertYoutube">Insert</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.toolbar-btn {
  @apply flex items-center justify-center w-7 h-7 rounded text-[#666] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors disabled:opacity-30 disabled:cursor-not-allowed;
}
.toolbar-btn.active {
  @apply text-[#6366f1] bg-[#1a1a2e];
}
.toolbar-sep {
  @apply w-px h-4 bg-[#1f1f1f] mx-1;
}
</style>
