<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl } from '@vue-flow/node-resizer'
import { FilmIcon, PlayIcon, SquareIcon } from '@lucide/vue'
import type { BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf, siteName, youtubeId, youtubeStart } from '~/lib/board'
import CardHandles from './CardHandles.vue'
import CardNameInput from './CardNameInput.vue'

// A YouTube video on the board: its picture, and it plays right on the card.
// (The video is loaded from YouTube only when you press Play.)
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const look = computed(() => colorOf(props.data.color))
const editing = computed(() => board.editingId.value === props.id)
const videoId = computed(() => youtubeId(props.data.url ?? ''))
const picture = computed(() => (videoId.value ? `https://i.ytimg.com/vi/${videoId.value}/hqdefault.jpg` : ''))
const player = computed(() => {
  if (!videoId.value) return ''
  const start = youtubeStart(props.data.url ?? '')
  return `https://www.youtube-nocookie.com/embed/${videoId.value}?autoplay=1${start ? `&start=${start}` : ''}`
})
const playing = ref(false)

function play() {
  if (player.value) playing.value = true
  else if (props.data.url) window.open(props.data.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div
    class="board-card h-full"
    :class="{ 'is-selected': selected }"
    :style="{ borderColor: look.border, background: look.bg }"
    @dblclick.stop="play"
  >
    <CardHandles />
    <NodeResizeControl
      :node-id="id"
      position="right"
      variant="line"
      class="board-resize"
      :min-width="200"
      :max-width="1200"
      @resize-end="board.resized(id, { w: $event.params.width })"
    />

    <div class="flex items-center gap-1.5 mb-1.5 text-[11px] text-[#666] select-none min-w-0">
      <FilmIcon :size="12" class="shrink-0" />
      <span class="truncate">Video · {{ siteName(data.url) || 'YouTube' }}</span>
      <button
        v-if="playing"
        class="nodrag ml-auto flex items-center gap-1 px-1.5 rounded text-[#999] hover:text-white hover:bg-[#1a1a1a]"
        title="Stop the video"
        @click.stop="playing = false"
      >
        <SquareIcon :size="10" />
        Stop
      </button>
    </div>
    <CardNameInput v-if="editing" :id="id" :value="data.text" placeholder="Name of the video" class="mb-1.5" />
    <div v-else-if="data.text" class="mb-1.5 text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
      {{ data.text }}
    </div>

    <div class="relative w-full aspect-video overflow-hidden rounded-md bg-black">
      <iframe
        v-if="playing"
        class="nodrag nowheel nopan absolute inset-0 w-full h-full"
        :src="player"
        title="YouTube video"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
      />
      <button
        v-else
        class="nodrag group absolute inset-0 w-full h-full"
        :title="videoId ? 'Play the video here' : 'Open it on YouTube'"
        @click.stop="play"
      >
        <img v-if="picture" :src="picture" alt="" class="w-full h-full object-cover" loading="lazy" referrerpolicy="no-referrer" draggable="false">
        <span class="absolute inset-0 flex items-center justify-center">
          <span class="flex items-center justify-center w-12 h-12 rounded-full bg-black/70 group-hover:bg-[#dc2626] transition-colors">
            <PlayIcon :size="22" class="ml-0.5 text-white" />
          </span>
        </span>
      </button>
    </div>
  </div>
</template>
