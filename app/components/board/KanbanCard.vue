<script setup lang="ts">
import { FileTextIcon, FilmIcon, ImageOffIcon, LinkIcon, LockIcon, PaperclipIcon, PlayIcon, SquareIcon } from '@lucide/vue'
import { opensInBrowser, type CardContent } from '#shared/board'
import { colorOf, siteName, youtubeId, youtubeStart } from '~/lib/board'
import { downloadBoardFile, fileKindText, fileSizeText, fileUrl, openBoardFile } from '~/lib/boardFiles'
import type { GroupNote } from '~/types/groups'
import CardNameInput from './CardNameInput.vue'
import CardTextInput from './CardTextInput.vue'

// A card on the Kanban: the same kinds as on the Mind map. Click to select it, drag it to move
// it. Double-click: read the note, write in the text card, or open the link, picture or file.
// (Clicks and drags reach the Kanban itself: @click, @dragstart and @dragend on this card.)
const props = defineProps<{
  card: CardContent
  /** The note of a note card. */
  note?: GroupNote
  selected: boolean
  /** Its words (or its name) are being written. */
  editing: boolean
  /** It is being dragged. */
  dragged: boolean
}>()

const emit = defineEmits<{
  read: [docId: string]
  edit: []
  done: [text: string | null]
}>()

const look = computed(() => colorOf(props.card.color))

// Videos: the picture first, and the player only when you press Play.
const videoId = computed(() => (props.card.kind === 'video' ? youtubeId(props.card.url ?? '') : null))
const picture = computed(() => (videoId.value ? `https://i.ytimg.com/vi/${videoId.value}/hqdefault.jpg` : ''))
const player = computed(() => {
  if (!videoId.value) return ''
  const start = youtubeStart(props.card.url ?? '')
  return `https://www.youtube-nocookie.com/embed/${videoId.value}?autoplay=1${start ? `&start=${start}` : ''}`
})
const playing = ref(false)

function play() {
  if (player.value) playing.value = true
  else if (props.card.url) window.open(props.card.url, '_blank', 'noopener,noreferrer')
}

// Pictures and files.
const src = computed(() => (props.card.kind === 'image' && props.card.fileId ? fileUrl(props.card.fileId) : ''))
const broken = ref(false)
watch(src, () => (broken.value = false))
const shows = computed(() => opensInBrowser(props.card.fileType))
const about = computed(() => [fileKindText(props.card.fileName, props.card.fileType), fileSizeText(props.card.fileSize)].filter(Boolean).join(' · '))
const href = computed(() => (props.card.kind === 'file' && props.card.fileId ? fileUrl(props.card.fileId, !shows.value) : undefined))

function openFile() {
  const id = props.card.fileId
  if (!id) return
  if (props.card.kind === 'image') {
    if (!broken.value) openBoardFile(id)
  } else if (shows.value) openBoardFile(id)
  else downloadBoardFile(id, props.card.fileName)
}

function onDblClick() {
  const c = props.card
  if (c.kind === 'note' && c.docId) emit('read', c.docId)
  else if (c.kind === 'text') emit('edit')
  else if (c.kind === 'link' && c.url) window.open(c.url, '_blank', 'noopener,noreferrer')
  else if (c.kind === 'video') play()
  else if (c.kind === 'image' || c.kind === 'file') openFile()
}
</script>

<template>
  <div
    class="board-card kanban-card"
    :class="{
      'is-selected': selected,
      'is-topic': card.kind === 'text' && card.style === 'topic',
      'is-picture': card.kind === 'image',
      'is-dragged': dragged,
    }"
    :style="{ borderColor: look.border, background: look.bg }"
    :data-card-id="card.id"
    :draggable="!editing"
    @dblclick.stop="onDblClick"
  >
    <!-- A note -->
    <template v-if="card.kind === 'note'">
      <div class="flex items-center gap-1.5 mb-1 text-[11px] uppercase tracking-wider text-[#666] select-none">
        <LockIcon v-if="note?.isPrivate" :size="12" />
        <FileTextIcon v-else :size="12" />
        Note
      </div>
      <div class="text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
        {{ note?.title || 'Untitled' }}
      </div>
      <p v-if="note?.preview" class="mt-1 text-[13px] leading-relaxed text-[#9a9a9a] break-words line-clamp-3">
        {{ note.preview }}
      </p>
    </template>

    <!-- Text -->
    <template v-else-if="card.kind === 'text'">
      <CardTextInput v-if="editing" :value="card.text" @done="(text) => emit('done', text)" />
      <div v-else-if="card.text" class="whitespace-pre-wrap break-words">{{ card.text }}</div>
      <div v-else class="italic text-[#555] select-none">Double-click to write</div>
    </template>

    <!-- A web page -->
    <template v-else-if="card.kind === 'link'">
      <div class="flex items-center gap-1.5 mb-1 text-[11px] text-[#666] select-none min-w-0">
        <LinkIcon :size="12" class="shrink-0" />
        <span class="truncate">{{ siteName(card.url) || 'Link' }}</span>
      </div>
      <CardNameInput v-if="editing" :value="card.text" placeholder="Name of the link" @done="(name) => emit('done', name)" />
      <div v-else-if="card.text" class="text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
        {{ card.text }}
      </div>
      <a
        class="block mt-0.5 truncate text-[12px] text-[#818cf8] hover:underline"
        :href="card.url"
        target="_blank"
        rel="noopener noreferrer nofollow"
        draggable="false"
        :title="`Open ${card.url}`"
        @dblclick.stop
      >{{ card.url }}</a>
    </template>

    <!-- A YouTube video -->
    <template v-else-if="card.kind === 'video'">
      <div class="flex items-center gap-1.5 mb-1 text-[11px] text-[#666] select-none min-w-0">
        <FilmIcon :size="12" class="shrink-0" />
        <span class="truncate">Video · {{ siteName(card.url) || 'YouTube' }}</span>
        <button
          v-if="playing"
          class="ml-auto flex items-center gap-1 px-1.5 rounded text-[#999] hover:text-white hover:bg-[#1a1a1a]"
          title="Stop the video"
          @click.stop="playing = false"
        >
          <SquareIcon :size="10" />
          Stop
        </button>
      </div>
      <CardNameInput v-if="editing" :value="card.text" placeholder="Name of the video" class="mb-1.5" @done="(name) => emit('done', name)" />
      <div v-else-if="card.text" class="mb-1.5 text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
        {{ card.text }}
      </div>
      <div class="relative w-full aspect-video overflow-hidden rounded-md bg-black">
        <iframe
          v-if="playing"
          class="absolute inset-0 w-full h-full"
          :src="player"
          title="YouTube video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowfullscreen
          referrerpolicy="strict-origin-when-cross-origin"
        />
        <button
          v-else
          class="group absolute inset-0 w-full h-full"
          :title="videoId ? 'Play the video here' : 'Open it on YouTube'"
          @click.stop="play"
        >
          <img v-if="picture" :src="picture" alt="" class="w-full h-full object-cover" loading="lazy" referrerpolicy="no-referrer" draggable="false">
          <span class="absolute inset-0 flex items-center justify-center">
            <span class="flex items-center justify-center w-11 h-11 rounded-full bg-black/70 group-hover:bg-[#dc2626] transition-colors">
              <PlayIcon :size="20" class="ml-0.5 text-white" />
            </span>
          </span>
        </button>
      </div>
    </template>

    <!-- A picture -->
    <template v-else-if="card.kind === 'image'">
      <img
        v-if="src && !broken"
        :src="src"
        :alt="card.text || card.fileName || 'Picture'"
        class="block w-full h-auto max-h-80 object-contain rounded-md bg-black select-none"
        draggable="false"
        @error="broken = true"
      >
      <div v-else class="flex flex-col items-center justify-center gap-1.5 px-3 py-6 text-center text-[12px] text-[#666]">
        <ImageOffIcon :size="20" />
        This picture is not on the server any more.
      </div>
      <CardNameInput v-if="editing" :value="card.text" placeholder="Words under the picture" class="mt-1.5" @done="(name) => emit('done', name)" />
      <div v-else-if="card.text" class="mt-1.5 px-1 pb-0.5 text-[13px] leading-snug text-[#ddd] break-words">
        {{ card.text }}
      </div>
    </template>

    <!-- A file -->
    <template v-else-if="card.kind === 'file'">
      <div class="flex items-center gap-1.5 mb-1 text-[11px] text-[#666] select-none min-w-0">
        <FileTextIcon v-if="card.fileType === 'application/pdf'" :size="12" class="shrink-0" />
        <PaperclipIcon v-else :size="12" class="shrink-0" />
        <span class="truncate">{{ about }}</span>
      </div>
      <CardNameInput v-if="editing" :value="card.text" placeholder="Name of the file" @done="(name) => emit('done', name)" />
      <div v-else class="text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
        {{ card.text || card.fileName }}
      </div>
      <a
        v-if="href"
        class="block mt-0.5 truncate text-[12px] text-[#818cf8] hover:underline"
        :href="href"
        :target="shows ? '_blank' : undefined"
        :download="shows ? undefined : card.fileName"
        rel="noopener noreferrer"
        draggable="false"
        :title="shows ? 'Open it in a new tab' : 'Download it'"
        @dblclick.stop
      >{{ card.text ? card.fileName : shows ? 'Open' : 'Download' }}</a>
    </template>
  </div>
</template>
