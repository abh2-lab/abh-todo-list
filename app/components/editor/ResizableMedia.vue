<script setup lang="ts">
import { NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<{
  node: any
  updateAttributes: (attrs: Record<string, any>) => void
  selected: boolean
}>()

const MIN_WIDTH = 100
const MIN_HEIGHT = 60

const container = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const isResizing = ref(false)

const width = computed(() => props.node.attrs.width ?? '100%')
const height = computed(() => props.node.attrs.height ?? 'auto')
const src = computed(() => props.node.attrs.src ?? '')
const mediaType = computed(() => {
  if (props.node.type.name === 'youtube') return 'youtube'
  if (/\.(mp4|webm|ogg)$/i.test(src.value)) return 'video'
  return 'image'
})

function startResize(e: MouseEvent, direction: string) {
  e.preventDefault()
  e.stopPropagation()
  isResizing.value = true

  const el = container.value!
  const startX = e.clientX
  const startY = e.clientY
  const startW = el.offsetWidth
  const startH = el.offsetHeight

  function onMove(ev: MouseEvent) {
    let newW = startW
    let newH = startH

    if (direction.includes('e')) newW = Math.max(MIN_WIDTH, startW + (ev.clientX - startX))
    if (direction.includes('w')) newW = Math.max(MIN_WIDTH, startW - (ev.clientX - startX))
    if (direction.includes('s')) newH = Math.max(MIN_HEIGHT, startH + (ev.clientY - startY))

    props.updateAttributes({ width: `${newW}px`, height: `${newH}px` })
  }

  function onUp() {
    isResizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}
</script>

<template>
  <NodeViewWrapper class="relative inline-block my-3 max-w-full">
    <div
      ref="container"
      class="relative group inline-block overflow-hidden rounded"
      :style="{ width, height }"
      :class="{ 'ring-2 ring-[#6366f1]': selected }"
    >
      <!-- Image -->
      <img
        v-if="mediaType === 'image'"
        :src="src"
        :alt="node.attrs.alt ?? ''"
        class="w-full h-full object-cover block"
        draggable="false"
      />

      <!-- Video -->
      <video
        v-else-if="mediaType === 'video'"
        :src="src"
        class="w-full h-full object-cover block"
        controls
      />

      <!-- YouTube iframe -->
      <iframe
        v-else
        :src="src"
        class="w-full h-full block"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        frameborder="0"
      />

      <!-- Resize handles (visible on hover or selected) -->
      <template v-if="!isFullscreen">
        <!-- East -->
        <div
          class="absolute top-0 right-0 w-2 h-full cursor-e-resize opacity-0 group-hover:opacity-100 bg-[#6366f1]/20 hover:bg-[#6366f1]/50 transition-opacity"
          @mousedown.prevent="startResize($event, 'e')"
        />
        <!-- South -->
        <div
          class="absolute bottom-0 left-0 w-full h-2 cursor-s-resize opacity-0 group-hover:opacity-100 bg-[#6366f1]/20 hover:bg-[#6366f1]/50 transition-opacity"
          @mousedown.prevent="startResize($event, 's')"
        />
        <!-- SE corner -->
        <div
          class="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize opacity-0 group-hover:opacity-100 z-10"
          @mousedown.prevent="startResize($event, 'se')"
        >
          <svg class="w-4 h-4 text-[#6366f1]" viewBox="0 0 16 16" fill="none">
            <path d="M4 12l8-8M8 12h4V8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      </template>

      <!-- Fullscreen button -->
      <button
        class="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 hover:bg-black transition-opacity z-10"
        title="Fullscreen"
        @click.prevent="isFullscreen = true"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- Fullscreen overlay -->
    <Teleport to="body">
      <div
        v-if="isFullscreen"
        class="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
        @click.self="isFullscreen = false"
      >
        <button
          class="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-[#111] text-[#999] hover:text-white hover:bg-[#1a1a1a] transition-colors"
          @click="isFullscreen = false"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <img
          v-if="mediaType === 'image'"
          :src="src"
          class="max-w-[90vw] max-h-[90vh] object-contain rounded"
        />
        <video
          v-else-if="mediaType === 'video'"
          :src="src"
          class="max-w-[90vw] max-h-[90vh] rounded"
          controls
          autoplay
        />
        <iframe
          v-else
          :src="src"
          class="w-[90vw] h-[80vh] rounded"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          frameborder="0"
        />
      </div>
    </Teleport>
  </NodeViewWrapper>
</template>
