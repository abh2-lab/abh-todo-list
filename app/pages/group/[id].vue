<script setup lang="ts">
import { MonitorIcon } from '@lucide/vue'

// The boards of a group: /group/<id> shows its Mind map (?view=map) or its Kanban (?view=kanban).
// Without ?view it opens the one you used last for this group. Only its owner can open it, and
// it is made for computers and tablets (on a phone there is a short message instead).
const route = useRoute()
const id = computed(() => String(route.params.id))
const { loggedIn, loginUrl } = useAccount()
const isMobile = useIsMobile()
// The screen size is known once the page is on the screen: show nothing before that, so a
// phone never starts the board for a moment.
const ready = ref(false)
onMounted(() => {
  ready.value = true
})

type View = 'map' | 'kanban'

function lastView(groupId: string): View {
  try {
    return localStorage.getItem(`group-view:${groupId}`) === 'kanban' ? 'kanban' : 'map'
  } catch {
    return 'map'
  }
}

const view = computed<View>(() => {
  const asked = route.query.view
  return asked === 'kanban' || asked === 'map' ? asked : lastView(id.value)
})

watch(
  [id, view],
  ([groupId, v]) => {
    try {
      localStorage.setItem(`group-view:${groupId}`, v)
    } catch {
      // No storage: the Mind map opens first next time.
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="!ready" class="h-screen bg-black" />

  <div v-else-if="!loggedIn" class="flex flex-col h-screen items-center justify-center gap-3 bg-black text-center px-6">
    <p class="text-sm text-[#888]">Log in to see your groups and their boards.</p>
    <a :href="loginUrl" class="btn btn-accent">Log in</a>
    <NuxtLink to="/" class="text-[#6366f1] text-sm hover:underline">Go to notes</NuxtLink>
  </div>

  <div v-else-if="isMobile" class="flex flex-col h-screen items-center justify-center gap-3 bg-black text-center px-8">
    <MonitorIcon :size="28" class="text-[#2a2a2a]" />
    <p class="text-sm text-[#888]">Boards are made for computers and tablets.</p>
    <p class="text-xs text-[#555]">Open this page on a bigger screen to see and change the board.</p>
    <NuxtLink to="/" class="text-[#6366f1] text-sm hover:underline">Go to notes</NuxtLink>
  </div>

  <BoardKanbanView v-else-if="view === 'kanban'" :key="`kanban-${id}`" :group-id="id" />
  <BoardView v-else :key="`map-${id}`" :group-id="id" />
</template>
