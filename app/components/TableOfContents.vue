<script setup lang="ts">
interface TocHeading {
  level: number
  text: string
  pos: number
}

const props = defineProps<{
  headings: TocHeading[]
}>()

const emit = defineEmits<{
  'jump': [pos: number]
}>()

const activePos = ref<number | null>(null)

function jump(pos: number) {
  activePos.value = pos
  emit('jump', pos)
}

const indentMap: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-4',
  3: 'pl-7',
  4: 'pl-10',
}
</script>

<template>
  <aside class="w-56 shrink-0 border-l border-[#1f1f1f] overflow-y-auto hidden lg:block">
    <div class="px-5 pt-5 pb-4">
      <div v-if="headings.length === 0" class="text-xs text-[#2a2a2a] select-none">
        No headings yet
      </div>

      <template v-else>
        <div class="mb-3 text-xs uppercase tracking-widest text-[#383838] font-semibold select-none">
          On this page
        </div>

        <nav class="space-y-1">
          <button
            v-for="heading in headings"
            :key="heading.pos"
            :class="[
              'w-full text-left text-xs py-1.5 px-2.5 rounded transition-colors truncate leading-snug',
              indentMap[heading.level] ?? 'pl-2',
              activePos === heading.pos
                ? 'text-[#818cf8] bg-[#1a1a2e]'
                : 'text-[#4a4a4a] hover:text-[#bbb] hover:bg-[#0f0f0f]',
              heading.level === 1 ? 'font-medium text-[#555]' : '',
            ]"
            @click="jump(heading.pos)"
          >
            {{ heading.text || '(empty)' }}
          </button>
        </nav>
      </template>
    </div>
  </aside>
</template>
