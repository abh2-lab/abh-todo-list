<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl } from '@vue-flow/node-resizer'
import { LinkIcon } from '@lucide/vue'
import type { BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf, siteName } from '~/lib/board'
import CardHandles from './CardHandles.vue'
import CardNameInput from './CardNameInput.vue'

// A web page on the board: its name (if you gave one) and its address.
// Click the address, or double-click the card, to open the page in a new tab.
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const look = computed(() => colorOf(props.data.color))
const site = computed(() => siteName(props.data.url))
const editing = computed(() => board.editingId.value === props.id)

function open() {
  if (props.data.url) window.open(props.data.url, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div
    class="board-card h-full"
    :class="{ 'is-selected': selected }"
    :style="{ borderColor: look.border, background: look.bg }"
    @dblclick.stop="open"
  >
    <CardHandles />
    <NodeResizeControl
      :node-id="id"
      position="right"
      variant="line"
      class="board-resize"
      :min-width="160"
      :max-width="900"
      @resize-end="board.resized(id, { w: $event.params.width })"
    />

    <div class="flex items-center gap-1.5 mb-1.5 text-[11px] text-[#666] select-none min-w-0">
      <LinkIcon :size="12" class="shrink-0" />
      <span class="truncate">{{ site || 'Link' }}</span>
    </div>
    <CardNameInput v-if="editing" :id="id" :value="data.text" placeholder="Name of the link" />
    <div v-else-if="data.text" class="text-[15px] font-semibold leading-snug text-[#f0f0f0] break-words">
      {{ data.text }}
    </div>
    <a
      class="nodrag block mt-1 truncate text-[12px] text-[#818cf8] hover:underline"
      :href="data.url"
      target="_blank"
      rel="noopener noreferrer nofollow"
      :title="`Open ${data.url}`"
      @dblclick.stop
    >{{ data.url }}</a>
  </div>
</template>
