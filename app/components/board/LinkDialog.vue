<script setup lang="ts">
import { XIcon } from '@lucide/vue'
import { MAX_LABEL, MAX_URL, cleanWebAddress } from '#shared/board'

// "Add a link" on a board: a web page, or a YouTube video (it can be played on the board).
const emit = defineEmits<{
  add: [url: string, name: string]
  close: []
}>()

const url = ref('')
const name = ref('')
const error = ref('')
const urlInput = ref<HTMLInputElement | null>(null)

onMounted(() => nextTick(() => urlInput.value?.focus()))

function submit() {
  const clean = cleanWebAddress(url.value)
  if (!clean) {
    error.value = 'This is not a web address. It should look like example.com/page or https://…'
    return
  }
  emit('add', clean, name.value.trim())
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[9990] bg-black/70 flex items-start justify-center p-4 pt-[18vh]"
      @click.self="emit('close')"
      @keydown="onKey"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-dialog-title"
        class="w-full max-w-md flex flex-col gap-3 p-4 rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black"
        @submit.prevent="submit"
      >
        <div class="flex items-center gap-2">
          <h3 id="link-dialog-title" class="flex-1 text-sm font-medium text-[#f0f0f0]">Add a link</h3>
          <button type="button" class="btn btn-ghost btn-sm" title="Close" @click="emit('close')">
            <XIcon :size="15" />
          </button>
        </div>

        <label class="flex flex-col gap-1 text-xs text-[#888]">
          Web address
          <input
            ref="urlInput"
            v-model="url"
            type="text"
            inputmode="url"
            :maxlength="MAX_URL"
            placeholder="https://… (a YouTube link shows the video)"
            class="bg-[#0d0d0d] border border-[#1f1f1f] focus:border-[#6366f1]/50 rounded px-2.5 py-1.5 text-sm text-[#f0f0f0] outline-none placeholder:text-[#444]"
            @input="error = ''"
          >
        </label>
        <label class="flex flex-col gap-1 text-xs text-[#888]">
          Name (if you like)
          <input
            v-model="name"
            :maxlength="MAX_LABEL"
            placeholder="Like: Chapter 3 summary"
            class="bg-[#0d0d0d] border border-[#1f1f1f] focus:border-[#6366f1]/50 rounded px-2.5 py-1.5 text-sm text-[#f0f0f0] outline-none placeholder:text-[#444]"
          >
        </label>
        <p v-if="error" class="text-xs text-[#fca5a5]" role="alert">{{ error }}</p>
        <p class="text-2xs text-[#555]">Tip: you can also copy a link and press Ctrl+V on the board.</p>

        <div class="flex justify-end gap-2">
          <button type="button" class="btn btn-sm" @click="emit('close')">Cancel</button>
          <button type="submit" class="btn btn-accent btn-sm" :disabled="!url.trim()">Add</button>
        </div>
      </form>
    </div>
  </Teleport>
</template>
