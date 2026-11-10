<script setup lang="ts">
import type { TocHeading } from '~/types/editor'
import type { AppView, DocMeta, FullDoc } from '~/types/docs'
import EditorRootComp from '~/components/editor/EditorRoot.vue'

const props = defineProps<{
  view: AppView
  docs: DocMeta[]
  activeDoc: FullDoc | null
  saveStatus: 'saved' | 'saving' | 'unsaved'
  editorContent: Record<string, any>
  tocHeadings: TocHeading[]
  pendingCount: number
}>()

const emit = defineEmits<{
  'select-doc': [id: string]
  'delete-doc': [id: string]
  'new-doc': [opts?: { private?: boolean }]
  'update-title': [title: string]
  'update-content': [content: Record<string, any>]
  'update-toc': [headings: TocHeading[]]
  'update-save-status': [status: 'saved' | 'saving' | 'unsaved']
  'set-shared': [on: boolean]
  'update:view': [view: AppView]
  'open-pending': []
}>()

const { loggedIn } = useUserSession()

// Lines can be marked as "Today's task" only in your own private notes.
const taskMode = computed(() => loggedIn.value && !!props.activeDoc?.isPrivate)

const editorRef = ref<InstanceType<typeof EditorRootComp> | null>(null)
const setEditorRef = (el: any) => { editorRef.value = el }

const sidebarOpen = ref(false)
const viewMode = ref(false)
const tocOpen = ref(false)
const headerHidden = ref(false)

let lastScrollTop = 0
let scrollEl: HTMLElement | null = null

function onScroll() {
  if (!scrollEl) return
  const top = scrollEl.scrollTop
  if (top < 20) {
    headerHidden.value = false
  } else if (top > lastScrollTop + 5) {
    headerHidden.value = true
  } else if (top < lastScrollTop - 5) {
    headerHidden.value = false
  }
  lastScrollTop = top
}

function attachScroll() {
  const el = (editorRef.value as any)?.scroller as HTMLElement | undefined
  if (!el || el === scrollEl) return
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
  scrollEl = el
  scrollEl.addEventListener('scroll', onScroll, { passive: true })
  lastScrollTop = scrollEl.scrollTop
}

watch(editorRef, () => {
  nextTick(attachScroll)
})

watch(() => props.activeDoc?.id, () => {
  // Reset scroll tracking on doc switch
  nextTick(() => {
    if (scrollEl) lastScrollTop = scrollEl.scrollTop
    headerHidden.value = false
  })
})

// The header always shows on the Daily tasks page.
watch(() => props.view, () => { headerHidden.value = false })

onBeforeUnmount(() => {
  if (scrollEl) scrollEl.removeEventListener('scroll', onScroll)
})

function jumpToHeading(pos: number) {
  editorRef.value?.scrollToPos(pos)
}

function handleSidebarSelect(id: string) {
  emit('select-doc', id)
  sidebarOpen.value = false
}

function handleNewFromSidebar(opts: { private?: boolean }) {
  emit('new-doc', opts)
  sidebarOpen.value = false
}

function handleView(view: AppView) {
  emit('update:view', view)
  sidebarOpen.value = false
}

function handlePending() {
  emit('open-pending')
  sidebarOpen.value = false
}

// ---- Help tour ----
const tour = useTour()
function handleHelp() {
  sidebarOpen.value = false
  tour.start()
}
// During the tour, close the menu and show the toolbar, so the tour can point at things.
watch(tour.open, (isOpen) => {
  if (!isOpen) return
  sidebarOpen.value = false
  tocOpen.value = false
  viewMode.value = false
  headerHidden.value = false
})
</script>

<template>
  <div class="mobile-shell relative h-screen overflow-hidden bg-black">
    <MobileHeader
      :view="view"
      :title="activeDoc?.title ?? 'Untitled'"
      :save-status="saveStatus"
      :sidebar-open="sidebarOpen"
      :view-mode="viewMode"
      :doc-id="activeDoc?.id ?? null"
      :is-private="activeDoc?.isPrivate ?? false"
      :shared="activeDoc?.shared ?? false"
      :pending-count="pendingCount"
      :hidden="headerHidden"
      @update:title="emit('update-title', $event)"
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
      @toggle-view-mode="viewMode = !viewMode"
      @new-doc="emit('new-doc')"
      @set-shared="emit('set-shared', $event)"
    />

    <!-- Body — slides up when header hides so editor fills viewport -->
    <div
      v-show="view === 'notes'"
      class="absolute left-0 right-0 bottom-0 flex flex-col transition-[top] duration-200 ease-out min-w-0"
      :class="headerHidden ? 'top-0' : 'top-12'"
    >
      <EditorToolbar
        v-if="!viewMode"
        :editor="editorRef?.editor ?? null"
        :task-mode="taskMode"
      />

      <EditorRoot
        v-if="activeDoc"
        :ref="setEditorRef"
        :model-value="editorContent"
        :doc-id="activeDoc.id"
        :editable="!viewMode"
        :task-mode="taskMode"
        @update:model-value="emit('update-content', $event)"
        @update:toc-headings="emit('update-toc', $event)"
        @save-status="emit('update-save-status', $event)"
      />
      <div v-else class="flex-1 flex items-center justify-center text-[#2a2a2a] text-sm select-none">
        Loading…
      </div>
    </div>

    <!-- Daily tasks -->
    <TasksView v-if="view === 'tasks'" class="absolute left-0 right-0 bottom-0 top-12" />

    <!-- Sidebar backdrop + drawer -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="absolute inset-0 z-30 bg-black/50"
        @click="sidebarOpen = false"
      />
    </Transition>
    <Transition name="slide-left">
      <DocSidebar
        v-if="sidebarOpen"
        class="absolute left-0 top-0 bottom-0 z-40"
        wide
        :docs="docs"
        :active-id="view === 'notes' ? activeDoc?.id ?? null : null"
        :logged-in="loggedIn"
        @select="handleSidebarSelect"
        @delete="emit('delete-doc', $event)"
        @new-doc="handleNewFromSidebar"
        @close="sidebarOpen = false"
      >
        <template #top>
          <MobileNav
            :view="view"
            :pending-count="pendingCount"
            @update:view="handleView"
            @open-pending="handlePending"
            @open-help="handleHelp"
          />
        </template>
      </DocSidebar>
    </Transition>

    <!-- Floating TOC button (hidden when something is overlaying) -->
    <MobileFloatingTocButton
      v-if="view === 'notes' && tocHeadings.length && !sidebarOpen && !tocOpen"
      @click="tocOpen = true"
    />

    <!-- TOC drawer -->
    <MobileTocDrawer
      :headings="tocHeadings"
      :open="tocOpen"
      @close="tocOpen = false"
      @jump="jumpToHeading"
    />
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); }
</style>
