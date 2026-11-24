<script setup lang="ts">
import { BotIcon } from '@lucide/vue'

// "AI connections" (in the account menu): keys for AI apps like Claude Code, so they can read
// and change your notes and groups (the MCP connection, server/routes/mcp.ts).
// You make a key here and paste it into the AI app once. A key is shown only when it is made:
// the server keeps just a hash of it.
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

interface AiKey {
  id: string
  name: string
  keyStart: string
  createdAt: string
  lastUsedAt: string | null
}

type CopyWhat = 'address' | 'key' | 'command' | 'json'

const keys = ref<AiKey[]>([])
const loading = ref(false)
const loadFailed = ref(false)
const name = ref('')
const busy = ref(false)
const error = ref('')
/** The key just made, shown this once. */
const made = ref<{ id: string; name: string; key: string } | null>(null)
const copied = ref<CopyWhat | null>(null)
const panel = ref<HTMLElement | null>(null)

const address = computed(() => `${window.location.origin}/mcp`)
const claudeCommand = computed(() => (made.value
  ? `claude mcp add --transport http --scope user notes ${address.value} --header "Authorization: Bearer ${made.value.key}"`
  : ''))
const jsonSettings = computed(() => (made.value
  ? JSON.stringify({
      mcpServers: { notes: { type: 'http', url: address.value, headers: { Authorization: `Bearer ${made.value.key}` } } },
    }, null, 2)
  : ''))

async function load() {
  loading.value = true
  loadFailed.value = false
  try {
    keys.value = await $fetch<AiKey[]>('/api/ai-keys')
  } catch {
    loadFailed.value = true
  } finally {
    loading.value = false
  }
}

async function makeKey() {
  error.value = ''
  const keyName = name.value.trim()
  if (!keyName) {
    error.value = 'Give the key a name first, like "Claude Code on my laptop".'
    return
  }
  busy.value = true
  try {
    const row = await $fetch<AiKey & { key: string }>('/api/ai-keys', { method: 'POST', body: { name: keyName } })
    const { key, ...rest } = row
    keys.value = [rest, ...keys.value.filter((k) => k.id !== rest.id)]
    made.value = { id: rest.id, name: rest.name, key }
    name.value = ''
  } catch (e) {
    error.value = errorMessage(e) ?? 'Could not make the key. Check your connection and try again.'
  } finally {
    busy.value = false
  }
}

async function copy(what: CopyWhat, text: string) {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    setTimeout(() => { if (copied.value === what) copied.value = null }, 2000)
  } catch {
    // The browser does not allow copying here: show it so it can be copied by hand.
    window.prompt('Copy this:', text)
  }
}

async function remove(k: AiKey) {
  if (!confirm(`Delete the key "${k.name}"? AI apps that use it can't open your notes any more.`)) return
  error.value = ''
  try {
    await $fetch(`/api/ai-keys/${encodeURIComponent(k.id)}`, { method: 'DELETE' })
  } catch (e) {
    if (errorStatus(e) !== 404) {
      error.value = 'Could not delete the key. Try again.'
      return
    }
  }
  keys.value = keys.value.filter((x) => x.id !== k.id)
  if (made.value?.id === k.id) made.value = null
}

function dateText(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function usedText(k: AiKey) {
  if (!k.lastUsedAt) return 'Not used yet'
  const mins = Math.floor((Date.now() - Date.parse(k.lastUsedAt)) / 60_000)
  if (mins < 2) return 'Used just now'
  if (mins < 60) return `Used ${mins} minutes ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Used ${plural(hours, 'hour')} ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `Used ${plural(days, 'day')} ago`
  return `Last used ${dateText(k.lastUsedAt)}`
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(() => props.open, (open) => {
  if (open) {
    name.value = ''
    error.value = ''
    copied.value = null
    void load()
    window.addEventListener('keydown', onKey)
    // Keyboard and screen reader users start inside the window (not in a text box: on a phone
    // that would open the keyboard right away).
    void nextTick(() => panel.value?.focus())
  } else {
    // The new key is not kept on the screen after the window closes.
    made.value = null
    window.removeEventListener('keydown', onKey)
  }
}, { immediate: true })
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[9990] bg-black/70 flex items-center justify-center p-4"
        @click.self="emit('close')"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-connections-title"
          tabindex="-1"
          class="w-full max-w-lg max-h-[88vh] flex flex-col rounded-xl border border-[#1f1f1f] bg-[#0b0b0b] shadow-2xl shadow-black outline-none"
        >
          <div class="px-5 pt-5 pb-4 overflow-y-auto min-h-0">
            <h3 id="ai-connections-title" class="flex items-center gap-2 text-sm font-medium text-[#f0f0f0]">
              <BotIcon :size="15" class="text-[#777]" />
              AI connections
            </h3>
            <p class="text-xs text-[#888] mt-1.5 leading-relaxed">
              Let an AI app, like Claude Code, read and change your notes and groups. Make a key here,
              then paste it into the AI app once.
            </p>
            <p class="text-xs text-[#666] mt-1.5 leading-relaxed">
              The AI app acts as you: it can open your private notes and the public notes, and change them.
              It asks you before it deletes a note. Keep a key secret, like a password. Delete a key to turn it off.
            </p>

            <!-- The address of the connection -->
            <label class="block mt-4 text-2xs text-[#666]" for="ai-address">Address</label>
            <div class="mt-1 flex gap-2">
              <input
                id="ai-address"
                :value="address"
                readonly
                class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1 text-xs text-[#ddd] outline-none focus:border-[#6366f1]"
                @focus="($event.target as HTMLInputElement).select()"
              />
              <button class="btn btn-sm shrink-0" @click="copy('address', address)">{{ copied === 'address' ? 'Copied!' : 'Copy' }}</button>
            </div>

            <!-- Make a key -->
            <label class="block mt-4 text-2xs text-[#666]" for="ai-key-name">Make a key</label>
            <form class="mt-1 flex gap-2" @submit.prevent="makeKey">
              <input
                id="ai-key-name"
                v-model="name"
                maxlength="60"
                placeholder="A name, like: Claude Code on my laptop"
                class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1.5 text-xs text-[#f0f0f0] placeholder:text-[#444] outline-none focus:border-[#6366f1]"
              />
              <button type="submit" class="btn btn-accent shrink-0" :class="{ 'opacity-50 pointer-events-none': busy }">
                {{ busy ? 'Making…' : 'Make a key' }}
              </button>
            </form>
            <p v-if="error" class="mt-2 text-xs text-[#ef4444]" role="alert">{{ error }}</p>

            <!-- The new key, shown this once -->
            <div v-if="made" class="mt-4 p-3 rounded-lg border border-[#6366f1]/30 bg-[#0d0d1a]">
              <div class="text-xs text-[#a5b4fc]">
                Your new key “{{ made.name }}”. Copy it now: it is shown only this once.
              </div>
              <div class="mt-2 flex gap-2">
                <input
                  :value="made.key"
                  readonly
                  aria-label="The new key"
                  class="flex-1 min-w-0 bg-[#0a0a0a] border border-[#1f1f1f] rounded px-2 py-1 text-xs text-[#ddd] font-mono outline-none focus:border-[#6366f1]"
                  @focus="($event.target as HTMLInputElement).select()"
                />
                <button class="btn btn-sm shrink-0" @click="copy('key', made.key)">{{ copied === 'key' ? 'Copied!' : 'Copy' }}</button>
              </div>

              <div class="mt-3 flex items-center justify-between gap-2">
                <span class="text-2xs text-[#888]">For Claude Code, run this in a terminal:</span>
                <button class="btn btn-sm shrink-0" @click="copy('command', claudeCommand)">{{ copied === 'command' ? 'Copied!' : 'Copy' }}</button>
              </div>
              <pre class="ai-code mt-1.5">{{ claudeCommand }}</pre>

              <div class="mt-3 flex items-center justify-between gap-2">
                <span class="text-2xs text-[#888]">For other AI apps, use these settings:</span>
                <button class="btn btn-sm shrink-0" @click="copy('json', jsonSettings)">{{ copied === 'json' ? 'Copied!' : 'Copy' }}</button>
              </div>
              <pre class="ai-code mt-1.5">{{ jsonSettings }}</pre>
              <p class="mt-2 text-2xs text-[#666] leading-relaxed">
                Then start a new chat in the AI app (or restart it), and ask it to work with your notes.
              </p>
            </div>

            <!-- All your keys -->
            <h4 class="mt-5 text-xs font-medium text-[#aaa]">Your keys</h4>
            <p v-if="loading && !keys.length" class="mt-2 text-xs text-[#555]">Loading…</p>
            <p v-else-if="loadFailed" class="mt-2 text-xs text-[#888]">
              Could not load your keys.
              <button class="text-[#a5b4fc] hover:underline" @click="load">Try again</button>
            </p>
            <p v-else-if="!keys.length" class="mt-2 text-xs text-[#555]">No keys yet.</p>
            <ul v-else class="mt-1">
              <li
                v-for="k in keys"
                :key="k.id"
                class="py-2.5 border-t border-[#161616] first:border-t-0 flex items-center gap-3"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm text-[#ddd] truncate" :title="k.name">{{ k.name }}</div>
                  <div class="text-2xs text-[#555]">
                    <span class="font-mono">{{ k.keyStart }}…</span> · Made {{ dateText(k.createdAt) }} · {{ usedText(k) }}
                  </div>
                </div>
                <button class="btn btn-sm btn-danger shrink-0" @click="remove(k)">Delete</button>
              </li>
            </ul>
          </div>

          <div class="px-5 py-3 flex justify-end border-t border-[#161616] shrink-0">
            <button class="btn" @click="emit('close')">Close</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.ai-code {
  padding: 0.5rem 0.625rem;
  border: 1px solid #1f1f1f;
  border-radius: 0.25rem;
  background: #0a0a0a;
  color: #ddd;
  font-size: 0.6875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: all;
}
</style>
