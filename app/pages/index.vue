<script setup lang="ts">
import type { AppView } from '~/types/docs'

useHead({ title: 'Notes' })

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const { loggedIn } = useUserSession()

// "Open note" in the task list opens /?doc=…&task=… in a new tab: open that note and jump to the line.
const linkDocId = typeof route.query.doc === 'string' ? route.query.doc : null
const linkTaskId = typeof route.query.task === 'string' ? route.query.task : null
const focusTask = useFocusTask()
if (linkDocId && linkTaskId) focusTask.value = { docId: linkDocId, taskId: linkTaskId }

const {
  docs,
  activeDoc,
  saveStatus,
  editorContent,
  tocHeadings,
  editorRef,
  loadDoc,
  newDoc,
  deleteDoc,
  onContentUpdate,
  updateTitle,
  jumpToHeading,
  setShared,
} = useDocuments({ initialDocId: linkDocId })

// Lines can be marked as "Today's task" only in your own private notes.
const taskMode = computed(() => loggedIn.value && !!activeDoc.value?.isPrivate)

// Notes or Daily tasks. Kept in the address (?view=tasks), so a refresh stays on the same part.
// Daily tasks need a login.
const view = computed<AppView>({
  get: () => (loggedIn.value && route.query.view === 'tasks' ? 'tasks' : 'notes'),
  set: (v) => {
    router.replace({ query: { ...route.query, view: v === 'tasks' ? 'tasks' : undefined } })
  },
})

const sidebarOpen = ref(false)
const viewMode = ref(false)

function openDoc(id: string) {
  view.value = 'notes'
  loadDoc(id)
}

function makeDoc(opts?: { private?: boolean }) {
  view.value = 'notes'
  newDoc(opts ?? {})
}

// ---- Pending tasks: header button, phone menu dot, and the popup ----
const { count: pendingCount, refreshPending, popupShownToday, rememberPopupShown } = usePendingTasks()
const pendingOpen = ref(false)
let lastDay = todayKey()
let dayTimer: ReturnType<typeof setInterval> | null = null

async function checkPending() {
  if (!loggedIn.value) return
  await refreshPending()
  // The popup opens by itself at most once a day.
  if (pendingCount.value > 0 && !popupShownToday()) {
    pendingOpen.value = true
    rememberPopupShown()
  }
}

// After midnight, yesterday's open tasks become pending.
function checkNewDay() {
  const now = todayKey()
  if (now === lastDay) return
  lastDay = now
  checkPending()
}

function onVisibility() {
  if (document.visibilityState === 'visible') checkNewDay()
}

// Google login sends people back with ?login=failed when it did not work.
const loginFailed = ref(false)

onMounted(() => {
  checkPending()
  dayTimer = setInterval(checkNewDay, 60_000)
  document.addEventListener('visibilitychange', onVisibility)

  if (route.query.login === 'failed') {
    loginFailed.value = true
    router.replace({ query: { ...route.query, login: undefined } })
  }
  // The note link was used: take it out of the address, so a refresh does not jump again.
  if (route.query.doc !== undefined || route.query.task !== undefined) {
    router.replace({ query: { ...route.query, doc: undefined, task: undefined } })
  }
})

onBeforeUnmount(() => {
  if (dayTimer) clearInterval(dayTimer)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div>
    <!-- Mobile shell (<550px) -->
    <MobileShell
      v-if="isMobile"
      :view="view"
      :docs="docs"
      :active-doc="activeDoc"
      :save-status="saveStatus"
      :editor-content="editorContent"
      :toc-headings="tocHeadings"
      :pending-count="pendingCount"
      @select-doc="openDoc"
      @delete-doc="deleteDoc"
      @new-doc="makeDoc"
      @update-title="updateTitle"
      @update-content="onContentUpdate"
      @update-toc="tocHeadings = $event"
      @update-save-status="saveStatus = $event"
      @set-shared="setShared"
      @update:view="view = $event"
      @open-pending="pendingOpen = true"
    />

    <!-- Desktop / tablet shell (≥550px) -->
    <div v-else class="flex flex-col h-screen bg-black overflow-hidden">
      <AppHeader
        :view="view"
        :title="activeDoc?.title ?? 'Untitled'"
        :save-status="saveStatus"
        :sidebar-open="sidebarOpen"
        :view-mode="viewMode"
        :doc-id="activeDoc?.id ?? null"
        :is-private="activeDoc?.isPrivate ?? false"
        :shared="activeDoc?.shared ?? false"
        :pending-count="pendingCount"
        @update:title="updateTitle"
        @toggle-sidebar="sidebarOpen = !sidebarOpen"
        @toggle-view-mode="viewMode = !viewMode"
        @new-doc="makeDoc()"
        @set-shared="setShared"
        @update:view="view = $event"
        @open-pending="pendingOpen = true"
      />

      <!-- Body -->
      <div class="relative flex flex-1 min-h-0 overflow-hidden">

        <!-- Backdrop -->
        <Transition name="fade">
          <div
            v-if="sidebarOpen"
            class="absolute inset-0 z-20 bg-black/50"
            @click="sidebarOpen = false"
          />
        </Transition>

        <!-- Floating sidebar -->
        <Transition name="slide-left">
          <DocSidebar
            v-if="sidebarOpen"
            class="absolute left-0 top-0 bottom-0 z-30"
            :docs="docs"
            :active-id="view === 'notes' ? activeDoc?.id ?? null : null"
            :logged-in="loggedIn"
            @select="openDoc"
            @delete="deleteDoc"
            @new-doc="makeDoc"
            @close="sidebarOpen = false"
          />
        </Transition>

        <!-- Notes (kept alive while Daily tasks is open, so the editor keeps its place) -->
        <div v-show="view === 'notes'" class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          <!-- Editor column -->
          <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
            <!-- Toolbar — plain v-if avoids Transition + multi-root warning -->
            <EditorToolbar
              v-if="!viewMode"
              :editor="editorRef?.editor ?? null"
              :task-mode="taskMode"
            />

            <EditorRoot
              v-if="activeDoc"
              ref="editorRef"
              :model-value="editorContent"
              :doc-id="activeDoc.id"
              :editable="!viewMode"
              :task-mode="taskMode"
              @update:model-value="onContentUpdate"
              @update:toc-headings="tocHeadings = $event"
              @save-status="saveStatus = $event"
            />

            <div v-else class="flex-1 flex items-center justify-center text-[#2a2a2a] text-sm select-none">
              Loading…
            </div>
          </div>

          <!-- TOC sidebar -->
          <TableOfContents :headings="tocHeadings" @jump="jumpToHeading" />
        </div>

        <!-- Daily tasks -->
        <TasksView v-if="view === 'tasks'" class="flex-1 min-w-0" />
      </div>
    </div>

    <!-- Pending tasks popup (both phone and desktop) -->
    <TasksPendingPopup :open="pendingOpen" @close="pendingOpen = false" />

    <!-- Google login did not work -->
    <div
      v-if="loginFailed"
      class="fixed top-16 left-1/2 -translate-x-1/2 z-[9995] flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[#ef4444]/40 bg-[#1a0808] text-sm text-[#fca5a5] shadow-2xl"
    >
      Google login did not work. Try again.
      <button class="text-[#fca5a5] hover:text-white" title="Close" @click="loginFailed = false">✕</button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); }
</style>
