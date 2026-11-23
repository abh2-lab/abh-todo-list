<script setup lang="ts">
import { ChevronRightIcon, NetworkIcon, PencilIcon, PlusIcon, Trash2Icon } from '@lucide/vue'
import type { DocMeta } from '~/types/docs'
import type { GroupMeta } from '~/types/groups'

// "Groups" in the notes list (computers and tablets): notes put together by topic, like labels.
// Click a group's name to open its Mind map board. The arrow shows the notes in it.
const props = defineProps<{
  docs: DocMeta[]
  activeId: string | null
}>()

const emit = defineEmits<{
  /** A note was clicked. */
  select: [id: string]
  /** A board is opening: close the notes list. */
  close: []
}>()

const { groups, loadGroups, createGroup, renameGroup, deleteGroup } = useGroups()
const open = useState('groups-section-open', () => true)
const expanded = useState<string[]>('groups-expanded', () => [])
const problem = ref('')

onMounted(loadGroups)

const docById = computed(() => new Map(props.docs.map((d) => [d.id, d])))
const notesOf = (g: GroupMeta) => g.noteIds.map((id) => docById.value.get(id)).filter((d): d is DocMeta => !!d)

function toggle(id: string) {
  expanded.value = expanded.value.includes(id) ? expanded.value.filter((x) => x !== id) : [...expanded.value, id]
}

function openBoard(id: string) {
  emit('close')
  void navigateTo(`/group/${encodeURIComponent(id)}`)
}

function showProblem(text: string) {
  problem.value = text
  setTimeout(() => { if (problem.value === text) problem.value = '' }, 6000)
}

// ---- New group ----
const adding = ref(false)
const newName = ref('')
const newInput = ref<HTMLInputElement | null>(null)

function startAdding() {
  open.value = true
  adding.value = true
  newName.value = ''
  nextTick(() => newInput.value?.focus())
}

async function finishAdding() {
  const name = newName.value.trim()
  adding.value = false
  if (!name) return
  try {
    await createGroup(name)
  } catch (e) {
    showProblem(errorMessage(e) ?? 'Could not make the group. Check your connection and try again.')
  }
}

// ---- Rename ----
const renamingId = ref<string | null>(null)
const renameText = ref('')
const renameInput = ref<HTMLInputElement[] | null>(null)

function startRename(g: GroupMeta) {
  renamingId.value = g.id
  renameText.value = g.name
  nextTick(() => renameInput.value?.[0]?.select())
}

async function finishRename() {
  const id = renamingId.value
  renamingId.value = null
  const name = renameText.value.trim()
  const g = groups.value.find((x) => x.id === id)
  if (!id || !g || !name || name === g.name) return
  try {
    await renameGroup(id, name)
  } catch (e) {
    showProblem(errorMessage(e) ?? 'Could not rename the group. Check your connection and try again.')
  }
}

async function removeGroup(g: GroupMeta) {
  if (!confirm(`Delete the group "${g.name}" and its board, with the pictures and files on it?\nThe notes in it are not deleted: they stay in your notes list.`)) return
  try {
    await deleteGroup(g.id)
  } catch {
    showProblem('Could not delete the group. Check your connection and try again.')
  }
}
</script>

<template>
  <div class="pb-1">
    <!-- Header -->
    <div class="flex items-center gap-1 pl-2 pr-3 pt-3 pb-1">
      <button
        class="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded text-left text-2xs text-[#555] hover:text-[#999] hover:bg-[#0d0d0d] transition-colors select-none"
        :aria-expanded="open"
        :title="open ? 'Hide groups' : 'Show groups'"
        @click="open = !open"
      >
        <ChevronRightIcon :size="14" class="shrink-0 transition-transform" :class="{ 'rotate-90': open }" />
        <span class="shrink-0 font-semibold uppercase tracking-wider">Groups</span>
        <span class="min-w-0 truncate text-[#333]">· only you</span>
      </button>
      <button
        class="w-6 h-6 flex items-center justify-center rounded text-[#555] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] transition-colors shrink-0"
        title="New group (a Mind map board for some of your notes)"
        @click="startAdding"
      >
        <PlusIcon :size="14" />
      </button>
    </div>

    <template v-if="open">
      <!-- New group name -->
      <form v-if="adding" class="px-4 py-1" @submit.prevent="finishAdding">
        <input
          ref="newInput"
          v-model="newName"
          maxlength="100"
          placeholder="Group name, then Enter"
          class="w-full bg-[#0d0d0d] border border-[#6366f1]/50 rounded px-2 py-1.5 text-sm text-[#f0f0f0] outline-none placeholder:text-[#444]"
          @keydown.esc="adding = false"
          @blur="finishAdding"
        >
      </form>

      <div v-if="problem" class="mx-4 my-1 text-xs text-[#fca5a5]" role="alert">{{ problem }}</div>

      <div v-if="groups.length === 0 && !adding" class="px-4 py-1.5 text-xs text-[#333] select-none leading-relaxed">
        No groups yet. Click + to put notes together by topic and see them on a Mind map.
      </div>

      <div v-for="g in groups" :key="g.id">
        <div class="group/row flex items-center gap-1 pl-2 pr-2 py-0.5 hover:bg-[#0d0d0d] transition-colors">
          <button
            class="w-6 h-6 flex items-center justify-center rounded text-[#444] hover:text-[#ccc] shrink-0"
            :title="expanded.includes(g.id) ? 'Hide its notes' : 'Show its notes'"
            :aria-expanded="expanded.includes(g.id)"
            @click="toggle(g.id)"
          >
            <ChevronRightIcon :size="14" class="transition-transform" :class="{ 'rotate-90': expanded.includes(g.id) }" />
          </button>

          <input
            v-if="renamingId === g.id"
            ref="renameInput"
            v-model="renameText"
            maxlength="100"
            class="flex-1 min-w-0 bg-[#0d0d0d] border border-[#6366f1]/50 rounded px-1.5 py-1 text-sm text-[#f0f0f0] outline-none"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
            @keydown.esc="renamingId = null"
            @blur="finishRename"
          >
          <button
            v-else
            class="flex-1 min-w-0 flex items-center gap-2 py-1.5 text-left"
            :title="`Open the board of ${g.name}`"
            @click="openBoard(g.id)"
          >
            <NetworkIcon :size="15" class="shrink-0 text-[#6366f1]/70" />
            <span class="min-w-0 text-sm text-[#888] group-hover/row:text-[#ccc] line-clamp-2 break-words leading-snug">{{ g.name }}</span>
            <span class="shrink-0 text-2xs text-[#333]">{{ g.noteIds.length }}</span>
          </button>

          <button
            class="row-action w-6 h-6 flex items-center justify-center rounded text-[#333] hover:text-[#f0f0f0] hover:bg-[#1a1a1a] opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-all shrink-0"
            title="Rename"
            @click="startRename(g)"
          >
            <PencilIcon :size="13" />
          </button>
          <button
            class="row-action w-6 h-6 flex items-center justify-center rounded text-[#333] hover:text-[#ef4444] hover:bg-[#1a0808] opacity-0 group-hover/row:opacity-100 focus:opacity-100 transition-all shrink-0"
            title="Delete the group (not its notes)"
            @click="removeGroup(g)"
          >
            <Trash2Icon :size="13" />
          </button>
        </div>

        <!-- Its notes -->
        <div v-if="expanded.includes(g.id)" class="pb-1">
          <div v-if="notesOf(g).length === 0" class="pl-11 pr-4 py-1 text-xs text-[#333] select-none">
            No notes yet. Use the Groups button on a note, or open the board.
          </div>
          <button
            v-for="d in notesOf(g)"
            :key="d.id"
            class="w-full flex items-center gap-2 pl-11 pr-4 py-1.5 text-left text-xs transition-colors"
            :class="d.id === activeId ? 'text-[#f0f0f0] bg-[#111]' : 'text-[#777] hover:text-[#ccc] hover:bg-[#0d0d0d]'"
            :title="d.title || 'Untitled'"
            @click="emit('select', d.id)"
          >
            <span class="w-1 h-1 rounded-full bg-current shrink-0 opacity-60" />
            <span class="min-w-0 truncate">{{ d.title || 'Untitled' }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* No mouse to hover with (touch screens): the rename and delete buttons always show. */
@media (hover: none) {
  .row-action { opacity: 1; }
}
</style>
