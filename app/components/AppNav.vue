<script setup lang="ts">
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
</script>

<template>
  <nav class="flex items-center gap-1 min-w-0">
    <template v-if="loggedIn && user">
      <!-- Logged-in person: click for the Log out menu -->
      <div ref="menuRoot" class="relative shrink-0">
        <button
          class="nav-btn"
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
          <button class="btn w-full" @click="logout">Log out</button>
        </div>
      </div>

      <div class="w-px h-5 bg-[#1f1f1f] mx-1 shrink-0" />

      <button
        class="nav-btn"
        :class="{ 'nav-btn-active': view === 'notes' }"
        title="Notes"
        @click="emit('update:view', 'notes')"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 2h6l3 3v7h-9V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M8.5 2v3h3M4.5 7.5h5M4.5 9.75h3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="hidden lg:inline">Notes</span>
      </button>

      <button
        class="nav-btn"
        :class="{ 'nav-btn-active': view === 'tasks' }"
        data-tour="nav-tasks"
        title="Daily tasks"
        @click="emit('update:view', 'tasks')"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="1.75" y="2.75" width="10.5" height="9.5" rx="1.5" stroke="currentColor" stroke-width="1.2"/>
          <path d="M1.75 5.75h10.5M4.5 1.5V4M9.5 1.5V4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span class="hidden lg:inline">Daily tasks</span>
      </button>

      <button
        class="nav-btn"
        data-tour="nav-pending"
        :title="pendingCount ? `${pendingCount} pending ${pendingCount === 1 ? 'task' : 'tasks'}` : 'No pending tasks'"
        @click="emit('open-pending')"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3.5 9.5V6.5a3.5 3.5 0 017 0v3l1 1.5h-9l1-1.5z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M5.75 12.25a1.25 1.25 0 002.5 0" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <span class="hidden lg:inline">Pending</span>
        <span v-if="pendingCount > 0" class="pending-badge">{{ pendingCount }}</span>
      </button>
    </template>

    <template v-else>
      <span class="nav-btn nav-btn-active cursor-default" title="Notes">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2.5 2h6l3 3v7h-9V2z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
          <path d="M8.5 2v3h3M4.5 7.5h5M4.5 9.75h3.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="hidden lg:inline">Notes</span>
      </span>
      <a :href="loginUrl" class="btn btn-accent h-8" data-tour="login" title="Login with Google to keep private notes and daily tasks">
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
          <path d="M8.5 2.5h2.25a1 1 0 011 1v7a1 1 0 01-1 1H8.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
          <path d="M2 7h6.5M6 4.5L8.5 7 6 9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        Login with Google
      </a>
    </template>

    <!-- Help: a short tour of the app -->
    <button class="nav-btn" data-tour="help" title="Help: a short tour of the app" @click="startTour">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.2"/>
        <path d="M5.35 5.6a1.7 1.7 0 113.2.75c-.35.6-1.55.95-1.55 2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="7" cy="10.15" r=".7" fill="currentColor"/>
      </svg>
      <span class="hidden lg:inline">Help</span>
    </button>
  </nav>
</template>
