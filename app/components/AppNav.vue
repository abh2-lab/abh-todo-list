<script setup lang="ts">
import { BellIcon, BotIcon, CalendarDaysIcon, CircleHelpIcon, FileTextIcon, LogInIcon } from '@lucide/vue'
import type { AppView } from '~/types/docs'

// Center of the header: who is logged in, and the parts of the app.
defineProps<{
  view: AppView
  pendingCount: number
}>()

const emit = defineEmits<{
  'update:view': [view: AppView]
  'open-pending': []
}>()

const { loggedIn, user, firstName, logout, loginUrl } = useAccount()
const { start: startTour } = useTour()

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)
useClickOutside(menuRoot, () => { menuOpen.value = false })

// "AI connections": keys for AI apps like Claude Code.
const aiOpen = ref(false)
function openAi() {
  menuOpen.value = false
  aiOpen.value = true
}
</script>

<template>
  <nav class="flex items-center gap-1 min-w-0">
    <template v-if="loggedIn && user">
      <!-- Logged-in person: click for the Log out menu -->
      <div ref="menuRoot" class="relative shrink-0">
        <button
          class="nav-btn max-md:px-2"
          :class="{ 'nav-btn-active': menuOpen }"
          :title="`Logged in as ${user.email}`"
          @click="menuOpen = !menuOpen"
        >
          <UserAvatar :name="user.name" :src="user.avatar" :size="22" />
          <span class="hidden lg:inline max-w-[7rem] truncate">{{ firstName }}</span>
        </button>

        <div v-if="menuOpen" class="menu-panel absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-60">
          <div class="flex items-center gap-2.5 mb-3">
            <UserAvatar :name="user.name" :src="user.avatar" :size="32" />
            <div class="min-w-0">
              <div class="text-sm text-[#e0e0e0] truncate">{{ user.name }}</div>
              <div class="text-xs text-[#666] truncate">{{ user.email }}</div>
            </div>
          </div>
          <button class="btn w-full mb-2" title="Let AI apps like Claude Code read and change your notes" @click="openAi">
            <BotIcon :size="15" />
            AI connections
          </button>
          <button class="btn w-full" @click="logout">Log out</button>
        </div>
      </div>
      <AiConnectionsDialog :open="aiOpen" @close="aiOpen = false" />

      <div class="w-px h-5 bg-[#1f1f1f] mx-1 shrink-0" />

      <button
        class="nav-btn max-md:px-2"
        :class="{ 'nav-btn-active': view === 'notes' }"
        title="Notes"
        @click="emit('update:view', 'notes')"
      >
        <FileTextIcon :size="16" />
        <span class="hidden lg:inline">Notes</span>
      </button>

      <button
        class="nav-btn max-md:px-2"
        :class="{ 'nav-btn-active': view === 'tasks' }"
        data-tour="nav-tasks"
        title="Daily tasks"
        @click="emit('update:view', 'tasks')"
      >
        <CalendarDaysIcon :size="16" />
        <span class="hidden lg:inline">Daily tasks</span>
      </button>

      <button
        class="nav-btn max-md:px-2"
        data-tour="nav-pending"
        :title="pendingCount ? `${pendingCount} pending ${pendingCount === 1 ? 'task' : 'tasks'}` : 'No pending tasks'"
        @click="emit('open-pending')"
      >
        <BellIcon :size="16" />
        <span class="hidden lg:inline">Pending</span>
        <span v-if="pendingCount > 0" class="pending-badge">{{ pendingCount }}</span>
      </button>
    </template>

    <template v-else>
      <span class="nav-btn nav-btn-active max-md:px-2 cursor-default" title="Notes">
        <FileTextIcon :size="16" />
        <span class="hidden lg:inline">Notes</span>
      </span>
      <a :href="loginUrl" class="btn btn-accent h-9" data-tour="login" title="Login with Google to keep private notes and daily tasks">
        <LogInIcon :size="16" />
        Login with Google
      </a>
    </template>

    <!-- Help: a short tour of the app -->
    <button class="nav-btn max-md:px-2" data-tour="help" title="Help: a short tour of the app" @click="startTour">
      <CircleHelpIcon :size="16" />
      <span class="hidden lg:inline">Help</span>
    </button>
  </nav>
</template>
