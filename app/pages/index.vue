<script setup lang="ts">
import type { AppView } from '~/types/docs'
import type { OpenHow } from '~/composables/useDocuments'

// This page is "/" and also "/note/<id>" (app/router.options.ts). The fixed key keeps the page
// (and its editor) when you go from one note to another, so every note keeps its own undo list.
definePageMeta({ key: 'notes-app' })

const isMobile = useIsMobile()
const route = useRoute()
const router = useRouter()
const { loggedIn } = useUserSession()

/** The note in the address: /note/<id>. */
const addressDocId = () => (typeof route.params.id === 'string' ? route.params.id : null)
const noteAddress = (id: string) => `/note/${encodeURIComponent(id)}`

// "Open note" in the task list opens /note/<id>?task=… in a new tab: open that note and jump to the line.
// (Older links look like /?doc=…&task=…; they still work.)
const linkDocId = addressDocId() ?? (typeof route.query.doc === 'string' ? route.query.doc : null)
const linkTaskId = typeof route.query.task === 'string' ? route.query.task : null
const focusTask = useFocusTask()
if (linkDocId && linkTaskId) focusTask.value = { docId: linkDocId, taskId: linkTaskId }

// Notes or Daily tasks. Kept in the address (?view=tasks), so a refresh stays on the same part.
// Daily tasks need a login.
const view = computed<AppView>({
  get: () => (loggedIn.value && route.query.view === 'tasks' ? 'tasks' : 'notes'),
  set: (v) => {
    router.replace({ query: { ...route.query, view: v === 'tasks' ? 'tasks' : undefined } })
  },
})

const {
  notice,
  showNotice,
  docs,
  activeDoc,
  saveStatus,
  editorContent,
  tocHeadings,
  editorRef,
  loadDoc,
  newDoc,
  deleteDoc,
  onRestored,
  onContentUpdate,
  updateTitle,
  jumpToHeading,
  setShared,
  reloadKey,
  editors,
  hold,
  conflict,
  locked,
  editAnyway,
  justRead,
  keepMine,
  takeTheirs,
  onEditorSaveStatus,
} = useDocuments({
  initialDocId: linkDocId,
  active: () => view.value === 'notes',
  // The open note is always in the address (a refresh opens it again; Back and Forward go between notes).
  onOpen: (id: string, how: OpenHow) => {
    const path = noteAddress(id)
    if (route.path === path) return
    const query = { ...route.query, doc: undefined, task: undefined }
    void (how === 'replace' ? router.replace({ path, query }) : router.push({ path, query }))
  },
  // The address names a note that is not one of yours (maybe a note someone shared with a link):
  // show the view-only page, which opens shared notes and says so when a note can't be opened.
  onNotYours: (id: string) => {
    if (!addressDocId()) return false
    void router.replace(`/doc/${encodeURIComponent(id)}`)
    return true
  },
})

// Back or Forward in the browser (or a changed address): open the note in the address.
watch(addressDocId, async (id) => {
  if (!id || id === activeDoc.value?.id) return
  const ok = docs.value.some((d) => d.id === id) && await loadDoc(id, 'none')
  if (!ok && addressDocId() === id) {
    if (!docs.value.some((d) => d.id === id)) showNotice('This note can\'t be opened. It may have been moved to the Trash.')
    // Stay on the note that is open, and show it in the address again.
    if (activeDoc.value) void router.replace({ path: noteAddress(activeDoc.value.id), query: route.query })
  }
})

// Lines can be marked as "Today's task" only in your own private notes.
const taskMode = computed(() => loggedIn.value && !!activeDoc.value?.isPrivate)

// Tab title: "Rohit - 10 Nov 2026, Tuesday", or "Rohit - Daily tasks".
usePageTitle(() => {
  if (view.value === 'tasks') return 'Daily tasks'
  if (!activeDoc.value) return 'Notes'
  return activeDoc.value.title.trim() || 'Untitled'
})

const sidebarOpen = ref(false)
const viewMode = ref(false)

/** Show the notes (not Daily tasks). Done before a note opens, so its new address has no "?view=tasks". */
async function showNotes() {
  if (view.value !== 'notes') await router.replace({ query: { ...route.query, view: undefined } })
}

async function openDoc(id: string) {
  await showNotes()
  await loadDoc(id)
}

async function makeDoc(opts?: { private?: boolean }) {
  await showNotes()
  await newDoc(opts ?? {})
}

// ---- Trash: deleted notes, for 30 days (the Trash button at the bottom of the notes list) ----
const trashOpen = ref(false)

/** "Open it" after a note was restored. */
async function openRestored(id: string) {
  trashOpen.value = false
  await openDoc(id)
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

// ---- Help tour (the Help button). It opens by itself once for someone new. ----
const tour = useTour()

// During the tour, show a note with its toolbar, so the tour can point at its parts.
watch(tour.open, (isOpen) => {
  if (!isOpen) return
  if (view.value !== 'notes') view.value = 'notes'
  sidebarOpen.value = false
  viewMode.value = false
})

/** Wait until ok() is true (or until maxMs has passed). */
function whenTrue(ok: () => boolean, maxMs?: number) {
  return new Promise<void>((resolve) => {
    if (ok()) return resolve()
    let timer: ReturnType<typeof setTimeout> | undefined
    const stop = watch(ok, (yes) => {
      if (!yes) return
      stop()
      if (timer) clearTimeout(timer)
      resolve()
    })
    if (maxMs) timer = setTimeout(() => { stop(); resolve() }, maxMs)
  })
}

async function maybeStartTour() {
  // Not when a task's "Open note" link opened this page: that jumps to a line in the note.
  if (tour.seen() || linkTaskId) return
  // Wait for the note, so the tour has something to point at.
  await whenTrue(() => !!activeDoc.value, 5000)
  // The pending popup comes first; the tour opens after it is closed.
  await whenTrue(() => !pendingOpen.value)
  setTimeout(() => {
    if (!pendingOpen.value && !tour.open.value) tour.start()
  }, 400)
}

// Google login sends people back with ?login=failed when it did not work.
const loginFailed = ref(false)

onMounted(() => {
  void checkPending().finally(maybeStartTour)
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
      :locked="locked"
      :reload-key="reloadKey"
      @select-doc="openDoc"
      @delete-doc="deleteDoc"
      @open-trash="trashOpen = true"
      @new-doc="makeDoc"
      @update-title="updateTitle"
      @update-content="onContentUpdate"
      @update-toc="tocHeadings = $event"
      @update-save-status="onEditorSaveStatus"
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
            @open-trash="trashOpen = true"
            @close="sidebarOpen = false"
          />
        </Transition>

        <!-- Notes (kept alive while Daily tasks is open, so the editor keeps its place) -->
        <div v-show="view === 'notes'" class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
          <!-- Editor column -->
          <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
            <!-- Toolbar — plain v-if avoids Transition + multi-root warning -->
            <EditorToolbar
              v-if="!viewMode && !locked"
              :editor="editorRef?.editor ?? null"
              :task-mode="taskMode"
            />

            <EditorRoot
              v-if="activeDoc"
              ref="editorRef"
              :model-value="editorContent"
              :doc-id="activeDoc.id"
              :editable="!viewMode && !locked"
              :task-mode="taskMode"
              :reload-key="reloadKey"
              @update:model-value="onContentUpdate"
              @update:toc-headings="tocHeadings = $event"
              @save-status="onEditorSaveStatus"
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

    <!-- Trash (both phone and desktop) -->
    <TrashDialog
      :open="trashOpen"
      @close="trashOpen = false"
      @restored="onRestored"
      @open-note="openRestored"
    />

    <!-- Two people editing the same note: ask first, and never write over someone's changes unasked -->
    <NoteEditWarning
      v-if="view === 'notes'"
      :hold="hold"
      :editors="editors"
      :conflict="conflict"
      @edit-anyway="editAnyway"
      @just-read="justRead"
      @keep-mine="keepMine"
      @take-theirs="takeTheirs"
    />

    <!-- Help tour (both phone and desktop) -->
    <HelpTour />

    <!-- Google login did not work -->
    <div
      v-if="loginFailed"
      class="fixed top-16 left-1/2 -translate-x-1/2 z-[9995] flex items-center gap-3 px-4 py-2.5 rounded-lg border border-[#ef4444]/40 bg-[#1a0808] text-sm text-[#fca5a5] shadow-2xl"
    >
      Google login did not work. Try again.
      <button class="text-[#fca5a5] hover:text-white" title="Close" @click="loginFailed = false">✕</button>
    </div>

    <!-- A short message, like "You can make at most 100 new notes a day" -->
    <div
      v-if="notice"
      class="fixed top-16 left-1/2 -translate-x-1/2 z-[9995] flex items-center gap-3 w-max max-w-[92vw] px-4 py-2.5 rounded-lg border border-[#ef4444]/40 bg-[#1a0808] text-sm text-[#fca5a5] shadow-2xl"
      role="alert"
    >
      {{ notice }}
      <button class="shrink-0 text-[#fca5a5] hover:text-white" title="Close" @click="notice = ''">✕</button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); }
</style>
