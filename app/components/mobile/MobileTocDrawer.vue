<script setup lang="ts">
import type { TocHeading } from '~/types/editor'

const props = defineProps<{
  headings: TocHeading[]
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  jump: [pos: number]
}>()

const activePos = ref<number | null>(null)

function jump(pos: number) {
  activePos.value = pos
  emit('jump', pos)
  emit('close')
}

const indentMap: Record<number, string> = {
  1: 'pl-2',
  2: 'pl-4',
  3: 'pl-7',
  4: 'pl-10',
}
</script>

<template>
  <Teleport to="body">
    <!-- Backdrop -->
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-40 bg-black/50"
        @click="emit('close')"
      />
    </Transition>

    <!-- Drawer panel -->
    <Transition name="slide-right">
      <aside
        v-if="open"
        class="fixed right-0 top-0 bottom-0 z-50 w-[80vw] max-w-xs bg-[#080808] border-l border-[#1f1f1f] overflow-y-auto shadow-2xl"
      >
        <div class="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#161616]">
          <span class="text-xs font-semibold text-[#444] uppercase tracking-widest select-none">
            On this page
          </span>
          <button
            class="w-7 h-7 flex items-center justify-center rounded text-[#666] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors"
            title="Close"
            @click="emit('close')"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="px-4 py-3">
          <div v-if="headings.length === 0" class="text-xs text-[#2a2a2a] select-none">
            No headings yet
          </div>

          <nav v-else class="space-y-1">
            <button
              v-for="heading in headings"
              :key="heading.pos"
              :class="[
                'w-full text-left text-xs py-1.5 px-2.5 rounded transition-colors truncate leading-snug',
                indentMap[heading.level] ?? 'pl-2',
                activePos === heading.pos
                  ? 'text-[#818cf8] bg-[#1a1a2e]'
                  : 'text-[#888] hover:text-[#f0f0f0] hover:bg-[#0f0f0f]',
                heading.level === 1 ? 'font-medium' : '',
              ]"
              @click="jump(heading.pos)"
            >
              {{ heading.text || '(empty)' }}
            </button>
          </nav>
        </div>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-right-enter-active, .slide-right-leave-active { transition: transform 0.22s ease; }
.slide-right-enter-from, .slide-right-leave-to { transform: translateX(100%); }
</style>
