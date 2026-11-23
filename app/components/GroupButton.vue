<script setup lang="ts">
import { NetworkIcon, PlusIcon, TagIcon } from '@lucide/vue'
// "Groups" in the header (computers and tablets, logged in): put the open note in groups,
// like labels, or take it out. A note can be in many groups and stays in "My notes".
// Each group has a Mind map board: the icon next to a group's name opens it.
const props = defineProps<{ docId: string | null }>()

const { groups, loaded, loadGroups, createGroup, setInGroup } = useGroups()
const menuOpen = ref(false)
const root = ref<HTMLElement | null>(null)
useClickOutside(root, () => { menuOpen.value = false })
watch(() => props.docId, () => { menuOpen.value = false; problem.value = '' })

onMounted(() => { if (!loaded.value) void loadGroups() })

/** The groups the open note is in. */
const mine = computed(() => (props.docId ? groups.value.filter((g) => g.noteIds.includes(props.docId!)) : []))

const busy = ref<string | null>(null)
const problem = ref('')
const newName = ref('')

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  problem.value = ''
  if (menuOpen.value) void loadGroups()
}

async function setIn(groupId: string, on: boolean) {
  if (!props.docId) return
  busy.value = groupId
  problem.value = ''
  try {
    await setInGroup(groupId, props.docId, on)
  } catch (e) {
    problem.value = errorMessage(e) ?? 'Could not change the group. Check your connection and try again.'
  } finally {
    busy.value = null
  }
}

async function addGroup() {
  const name = newName.value.trim()
  if (!name || !props.docId) return
  problem.value = ''
  try {
    await createGroup(name, props.docId)
    newName.value = ''
  } catch (e) {
    problem.value = errorMessage(e) ?? 'Could not make the group. Check your connection and try again.'
  }
}
</script>

<template>
  <div v-if="docId" ref="root" class="relative shrink-0">
    <button
      data-tour="groups"
      class="flex items-center gap-1.5 text-btn px-3 max-md:px-2 py-1.5 rounded border transition-colors"
      :class="mine.length
        ? 'bg-[#6366f1]/10 border-[#6366f1]/30 text-[#a5b4fc] hover:bg-[#6366f1]/20'
        : 'bg-[#111] border-[#1f1f1f] text-[#888] hover:text-[#f0f0f0] hover:bg-[#1a1a1a]'"
      :title="mine.length ? `In: ${mine.map((g) => g.name).join(', ')}` : 'Put this note in a group'"
      :aria-expanded="menuOpen"
      @click="toggleMenu"
    >
      <TagIcon :size="16" />
      <span class="hidden xl:inline">Groups</span>
      <span v-if="mine.length" class="text-2xs tabular-nums">{{ mine.length }}</span>
    </button>

    <div v-if="menuOpen" class="menu-panel absolute right-0 top-full mt-2 z-50 w-72 text-left">
      <p class="text-xs text-[#888] leading-relaxed mb-2">
        Put this note in groups. Only you see them. Each group has a Mind map board.
      </p>

      <div v-if="groups.length" class="max-h-64 overflow-y-auto -mx-1">
        <label
          v-for="g in groups"
          :key="g.id"
          class="flex items-center gap-2 px-1.5 py-1.5 rounded hover:bg-[#111] cursor-pointer"
        >
          <input
            type="checkbox"
            class="accent-[#6366f1] w-3.5 h-3.5 shrink-0"
            :checked="g.noteIds.includes(docId)"
            :disabled="busy === g.id"
            @change="setIn(g.id, ($event.target as HTMLInputElement).checked)"
          >
          <span class="flex-1 min-w-0 truncate text-sm text-[#ccc]">{{ g.name }}</span>
          <NuxtLink
            :to="`/group/${encodeURIComponent(g.id)}`"
            class="w-6 h-6 flex items-center justify-center rounded text-[#555] hover:text-[#a5b4fc] hover:bg-[#1a1a1a] shrink-0"
            title="Open its board"
            @click.stop
          >
            <NetworkIcon :size="14" />
          </NuxtLink>
        </label>
      </div>
      <p v-else class="text-xs text-[#555] mb-1">No groups yet: make the first one below.</p>

      <form class="flex gap-2 mt-2 pt-2 border-t border-[#1a1a1a]" @submit.prevent="addGroup">
        <input
          v-model="newName"
          maxlength="100"
          placeholder="New group…"
          class="flex-1 min-w-0 bg-[#0d0d0d] border border-[#1f1f1f] focus:border-[#6366f1]/50 rounded px-2 py-1.5 text-sm text-[#f0f0f0] outline-none placeholder:text-[#444]"
        >
        <button class="btn btn-accent btn-sm" type="submit" :disabled="!newName.trim()">
          <PlusIcon :size="14" />
          Add
        </button>
      </form>
      <p v-if="problem" class="text-xs text-[#fca5a5] mt-2" role="alert">{{ problem }}</p>
    </div>
  </div>
</template>
