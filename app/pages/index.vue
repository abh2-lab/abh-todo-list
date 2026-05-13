<script setup lang="ts">
useHead({ title: 'Notes' })

const isMobile = useIsMobile()

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
} = useDocuments()

const sidebarOpen = ref(false)
const viewMode = ref(false)
</script>

<template>
  <!-- Mobile shell (<550px) -->
  <MobileShell
    v-if="isMobile"
    :docs="docs"
    :active-doc="activeDoc"
    :save-status="saveStatus"
    :editor-content="editorContent"
    :toc-headings="tocHeadings"
    @select-doc="loadDoc"
    @delete-doc="deleteDoc"
    @new-doc="newDoc"
    @update-title="updateTitle"
    @update-content="onContentUpdate"
    @update-toc="tocHeadings = $event"
    @update-save-status="saveStatus = $event"
  />

  <!-- Desktop / tablet shell (≥550px) — UNCHANGED from original -->
  <div v-else class="flex flex-col h-screen bg-black overflow-hidden">
    <AppHeader
      :title="activeDoc?.title ?? 'Untitled'"
      :save-status="saveStatus"
      :sidebar-open="sidebarOpen"
      :view-mode="viewMode"
      :doc-id="activeDoc?.id ?? null"
      @update:title="updateTitle"
      @toggle-sidebar="sidebarOpen = !sidebarOpen"
      @toggle-view-mode="viewMode = !viewMode"
      @new-doc="newDoc"
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
          :active-id="activeDoc?.id ?? null"
          @select="loadDoc"
          @delete="deleteDoc"
          @new-doc="newDoc"
          @close="sidebarOpen = false"
        />
      </Transition>

      <!-- Editor column -->
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <!-- Toolbar — plain v-if avoids Transition + multi-root warning -->
        <EditorToolbar
          v-if="!viewMode"
          :editor="editorRef?.editor ?? null"
        />

        <EditorRoot
          v-if="activeDoc"
          ref="editorRef"
          :model-value="editorContent"
          :doc-id="activeDoc.id"
          :editable="!viewMode"
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
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.slide-left-enter-active, .slide-left-leave-active { transition: transform 0.2s ease; }
.slide-left-enter-from, .slide-left-leave-to { transform: translateX(-100%); }
</style>
