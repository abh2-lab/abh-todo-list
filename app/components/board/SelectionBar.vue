<script setup lang="ts">
import { ArrowRightIcon, BookOpenIcon, DownloadIcon, ExternalLinkIcon, HeadingIcon, MinusIcon, PencilIcon, Trash2Icon, TypeIcon } from '@lucide/vue'
import { BOARD_COLORS, opensInBrowser, type BoardCard, type BoardColor, type BoardLine } from '#shared/board'
import { COLORS } from '~/lib/board'

// The bar at the top of the board for what is selected: colors, and what fits the card or line.
const props = defineProps<{
  cards: BoardCard[]
  lines: BoardLine[]
}>()

const emit = defineEmits<{
  color: [color: BoardColor]
  topic: []
  write: []
  label: []
  arrow: []
  dashed: []
  read: [docId: string]
  openLink: [url: string]
  openFile: [card: BoardCard]
  downloadFile: [card: BoardCard]
  remove: []
}>()

const count = computed(() => props.cards.length + props.lines.length)
const card = computed(() => (count.value === 1 ? props.cards[0] : undefined))
const line = computed(() => (count.value === 1 ? props.lines[0] : undefined))
const current = computed<BoardColor | null>(() => {
  const colors = new Set([...props.cards.map((c) => c.color ?? 'gray'), ...props.lines.map((l) => l.color ?? 'gray')])
  return colors.size === 1 ? ([...colors][0] as BoardColor) : null
})

const KIND_NAMES: Record<BoardCard['kind'], string> = {
  note: 'Note',
  text: 'Text',
  link: 'Link',
  video: 'Video',
  image: 'Picture',
  file: 'File',
}
const what = computed(() => {
  if (card.value) return KIND_NAMES[card.value.kind]
  if (line.value) return 'Line'
  return `${count.value} selected`
})
const removeTitle = computed(() => {
  if (props.cards.some((c) => c.kind === 'note')) return 'Take off the board (notes are not deleted: they stay in your notes list)'
  return 'Delete (Delete key). Ctrl+Z brings it back.'
})
</script>

<template>
  <div
    v-if="count > 0"
    class="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b]/95 shadow-2xl shadow-black"
    role="toolbar"
    aria-label="Selected"
  >
    <span class="px-1.5 text-2xs font-semibold uppercase tracking-wider text-[#666] select-none">{{ what }}</span>
    <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />

    <button
      v-for="c in BOARD_COLORS"
      :key="c"
      class="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1a1a1a]"
      :title="COLORS[c].name"
      :aria-pressed="current === c"
      @click="emit('color', c)"
    >
      <span
        class="w-3.5 h-3.5 rounded-full border-2"
        :style="{ borderColor: COLORS[c].line, background: current === c ? COLORS[c].line : 'transparent' }"
      />
    </button>

    <template v-if="card?.kind === 'text'">
      <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
      <button class="btn btn-ghost btn-sm" title="Write in it (or double-click the card)" @click="emit('write')">
        <PencilIcon :size="14" />
        Write
      </button>
      <button
        class="btn btn-ghost btn-sm"
        :class="{ '!text-[#a5b4fc] !bg-[#6366f1]/10': card.style === 'topic' }"
        :title="card.style === 'topic' ? 'Back to normal text' : 'Big and bold: the main topic'"
        @click="emit('topic')"
      >
        <HeadingIcon v-if="card.style !== 'topic'" :size="14" />
        <TypeIcon v-else :size="14" />
        Topic
      </button>
    </template>

    <template v-if="card?.kind === 'note' && card.docId">
      <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
      <button class="btn btn-ghost btn-sm" title="Read it here (or double-click the card)" @click="emit('read', card.docId)">
        <BookOpenIcon :size="14" />
        Read
      </button>
    </template>

    <template v-if="(card?.kind === 'link' || card?.kind === 'video') && card.url">
      <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
      <button class="btn btn-ghost btn-sm" :title="card.text ? 'Change its name' : 'Give it a name'" @click="emit('write')">
        <PencilIcon :size="14" />
        Name
      </button>
      <button class="btn btn-ghost btn-sm" title="Open it in a new tab" @click="emit('openLink', card.url)">
        <ExternalLinkIcon :size="14" />
        Open
      </button>
    </template>

    <template v-if="(card?.kind === 'image' || card?.kind === 'file') && card.fileId">
      <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
      <button
        class="btn btn-ghost btn-sm"
        :title="card.kind === 'image' ? 'Write a few words under the picture' : card.text ? 'Change its name' : 'Give it a name'"
        @click="emit('write')"
      >
        <PencilIcon :size="14" />
        {{ card.kind === 'image' ? 'Words' : 'Name' }}
      </button>
      <button v-if="opensInBrowser(card.fileType)" class="btn btn-ghost btn-sm" title="Open it in a new tab (or double-click the card)" @click="emit('openFile', card)">
        <ExternalLinkIcon :size="14" />
        Open
      </button>
      <button class="btn btn-ghost btn-sm" title="Download it to your computer" @click="emit('downloadFile', card)">
        <DownloadIcon :size="14" />
        Download
      </button>
    </template>

    <template v-if="line">
      <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
      <button class="btn btn-ghost btn-sm" title="Write on the line (or double-click it)" @click="emit('label')">
        <PencilIcon :size="14" />
        Words
      </button>
      <button
        class="btn btn-ghost btn-sm"
        :class="{ '!text-[#a5b4fc] !bg-[#6366f1]/10': line.arrow !== false }"
        title="Arrow at the end"
        @click="emit('arrow')"
      >
        <ArrowRightIcon :size="14" />
        Arrow
      </button>
      <button
        class="btn btn-ghost btn-sm"
        :class="{ '!text-[#a5b4fc] !bg-[#6366f1]/10': line.dashed }"
        title="Dashed line"
        @click="emit('dashed')"
      >
        <MinusIcon :size="14" />
        Dashed
      </button>
    </template>

    <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
    <button class="btn btn-ghost btn-sm hover:!text-[#fca5a5]" :title="removeTitle" @click="emit('remove')">
      <Trash2Icon :size="14" />
      {{ cards.some((c) => c.kind === 'note') && count === 1 ? 'Take off' : 'Delete' }}
    </button>
  </div>
</template>
