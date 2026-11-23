<script setup lang="ts">
import type { NodeProps } from '@vue-flow/core'
import { NodeResizeControl, ResizeControlVariant } from '@vue-flow/node-resizer'
import { ImageOffIcon } from '@lucide/vue'
import type { BoardCard } from '#shared/board'
import { BOARD_CONTEXT, colorOf } from '~/lib/board'
import { fileUrl } from '~/lib/boardFiles'
import CardHandles from './CardHandles.vue'
import CardNameInput from './CardNameInput.vue'

// A picture on the board, with a few words under it if you like.
// Double-click it to see it big, in a new tab.
const props = defineProps<NodeProps<BoardCard>>()
const board = inject(BOARD_CONTEXT)!

const look = computed(() => colorOf(props.data.color))
const editing = computed(() => board.editingId.value === props.id)
const src = computed(() => (props.data.fileId ? fileUrl(props.data.fileId) : ''))
const broken = ref(false)
watch(src, () => (broken.value = false))

function open() {
  if (src.value && !broken.value) window.open(src.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div
    class="board-card is-picture h-full"
    :class="{ 'is-selected': selected }"
    :style="{ borderColor: look.border, background: look.bg }"
    @dblclick.stop="open"
  >
    <CardHandles />
    <NodeResizeControl
      :node-id="id"
      position="right"
      :variant="ResizeControlVariant.Line"
      class="board-resize"
      :min-width="100"
      :max-width="1600"
      @resize-end="board.resized(id, { w: $event.params.width })"
    />

    <img
      v-if="src && !broken"
      :src="src"
      :alt="data.text || data.fileName || 'Picture'"
      class="block w-full h-auto rounded-md select-none"
      draggable="false"
      @error="broken = true"
    >
    <div v-else class="flex flex-col items-center justify-center gap-1.5 px-3 py-6 text-center text-[12px] text-[#666]">
      <ImageOffIcon :size="20" />
      This picture is not on the server any more.
    </div>

    <CardNameInput v-if="editing" :value="data.text" placeholder="Words under the picture" class="mt-1.5" @done="(name) => board.doneText(id, name)" />
    <div v-else-if="data.text" class="mt-1.5 px-1 pb-0.5 text-[13px] leading-snug text-[#ddd] break-words">
      {{ data.text }}
    </div>
  </div>
</template>
