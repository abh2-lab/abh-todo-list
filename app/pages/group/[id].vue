<script setup lang="ts">
import { MonitorIcon } from '@lucide/vue'

// The board of a group (a Mind map): /group/<id>. Only its owner can open it, and it is made
// for computers and tablets (on a phone there is a short message instead).
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

  <BoardView v-else :key="id" :group-id="id" />
</template>
