<script setup lang="ts">
import type { AppView } from '~/types/docs'

// Top of the phone menu: who is logged in, and the parts of the app.
// (On phones the header has no room for these.)
defineProps<{
  view: AppView
  pendingCount: number
}>()

const emit = defineEmits<{
  'update:view': [view: AppView]
  'open-pending': []
}>()

const { loggedIn, user, logout, loginUrl } = useAccount()
</script>

<template>
  <div class="px-4 pt-4 pb-3 border-b border-[#161616] shrink-0">
    <template v-if="loggedIn && user">
      <div class="flex items-center gap-2.5">
        <UserAvatar :name="user.name" :src="user.avatar" :size="30" />
        <div class="flex-1 min-w-0">
          <div class="text-sm text-[#e0e0e0] truncate">{{ user.name }}</div>
          <div class="text-xs text-[#555] truncate">{{ user.email }}</div>
        </div>
        <button class="btn shrink-0" @click="logout">Log out</button>
      </div>

      <div class="flex flex-wrap gap-1.5 mt-3">
        <button
          class="nav-btn border border-[#1f1f1f]"
          :class="{ 'nav-btn-active': view === 'notes' }"
          @click="emit('update:view', 'notes')"
        >
          Notes
        </button>
        <button
          class="nav-btn border border-[#1f1f1f]"
          :class="{ 'nav-btn-active': view === 'tasks' }"
          @click="emit('update:view', 'tasks')"
        >
          Daily tasks
        </button>
        <button class="nav-btn border border-[#1f1f1f]" @click="emit('open-pending')">
          Pending
          <span v-if="pendingCount > 0" class="pending-badge">{{ pendingCount }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <a :href="loginUrl" class="btn btn-accent w-full h-9">Login with Google</a>
      <p class="text-xs text-[#555] mt-2 leading-relaxed">
        Log in to keep private notes and use Daily tasks.
      </p>
    </template>
  </div>
</template>
