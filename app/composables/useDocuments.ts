import type { TocHeading } from '~/types/editor'
import type { DocMeta, EditHold, FullDoc, OtherEditor, SaveConflict } from '~/types/docs'
import type EditorRootComp from '~/components/editor/EditorRoot.vue'

// While a note is open, ask the server this often who else is editing it.
const CHECK_EDITORS_MS = 10_000

interface SaveJob {
  id: string
  content: Record<string, any>
}

/** A random id for this tab. (randomUUID needs https or localhost; getRandomValues does not.) */
function newTabId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Is time a later than time b? Both like "2026-11-12T10:06:00.123Z". */
function isNewer(a: string | undefined, b: string | undefined) {
  return !!a && (!b || Date.parse(a) > Date.parse(b))
}

/** How the address changes when a note is opened: a new entry (Back goes to the note before), the same entry, or not at all. */
export type OpenHow = 'push' | 'replace' | 'none'

export function useDocuments(opts: {
  /** The note to open first (from the address). */
  initialDocId?: string | null
  /** The note to open first is not one of your notes: true = the page takes care of it. */
  onNotYours?: (id: string) => boolean
  /** A note was opened: put it in the address. */
  onOpen?: (id: string, how: OpenHow) => void
  /** false while the notes are hidden (Daily tasks is open): then we don't check who is editing. */
  active?: () => boolean
} = {}) {
  const { loggedIn } = useUserSession()
  const { tasksChanged } = usePendingTasks()
  const docs = ref<DocMeta[]>([])
  const activeDoc = ref<FullDoc | null>(null)
  const saveStatus = ref<'saved' | 'saving' | 'unsaved'>('saved')
  const editorContent = ref<Record<string, any>>({})
  const tocHeadings = ref<TocHeading[]>([])
  const editorRef = ref<InstanceType<typeof EditorRootComp> | null>(null)
  // Goes up when the open note gets a newer version from the server, so the editor shows it.
  const reloadKey = ref(0)

  // ---- Two people, one note ----
  // Every tab has its own id, so the server can tell editors apart (even you in two tabs).
  const tab = newTabId()
  // Others who are editing the open note now (they saved a change in the last 2 minutes).
  const editors = ref<OtherEditor[]>([])
  // Why the open note is locked for now (see EditHold). null = you can edit.
  const hold = ref<EditHold>(null)
  // Someone else saved a note after we got it, and our changes are not saved: we ask what to do.
  const conflict = ref<SaveConflict | null>(null)
  let conflictJob: SaveJob | null = null
  // The newest version (updatedAt) we know of each note. It goes with every save,
  // so the server can tell us when someone else saved in between.
  const versions = new Map<string, string>()

  /** The open note can't be changed now: we are asking first, or the person is only reading. */
  const locked = computed(() =>
    !!activeDoc.value && (hold.value !== null || conflict.value?.docId === activeDoc.value.id))

  // ---- Saving ----
  // Auto-save runs 1s after the last change. We keep the note id together
  // with the content, so a save that runs after the user switched notes
  // still goes to the note that was edited (not the one open now).
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let pendingSave: SaveJob | null = null
  // Saves go one after the other: they reach the server in order,
  // and each one knows the version the one before it made.
  let saveQueue: Promise<void> = Promise.resolve()
  let savingId: string | null = null

  function queue(work: () => Promise<void>): Promise<void> {
    const run = saveQueue.then(work)
    saveQueue = run.catch(() => {})
    return saveQueue
  }

  function scheduleSave(ms: number) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void saveNow(), ms)
  }

  /** Save the waiting changes now. Resolves when every save so far is done. */
  function saveNow(): Promise<void> {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const job = pendingSave
    pendingSave = null
    return job ? queue(() => sendSave(job, false)) : saveQueue
  }

  async function sendSave(job: SaveJob, force: boolean) {
    const { id, content } = job
    // We are asking the person what to do about someone else's changes: keep these for the answer.
    if (!force && conflictJob?.id === id) {
      conflictJob = job
      return
    }
    const isOpen = () => activeDoc.value?.id === id
    if (isOpen()) saveStatus.value = 'saving'
    savingId = id
    try {
      const res = await $fetch<{ updatedAt: string; tasksChanged?: boolean }>(`/api/documents/${id}`, {
        method: 'PUT',
        body: { content, tab, base: versions.get(id), force: force || undefined },
      })
      gotVersion(id, res.updatedAt)
      if (isOpen() && pendingSave?.id !== id) saveStatus.value = 'saved'
      // A task line's text changed, or a task line was deleted: the task list changed too.
      if (res.tasksChanged) void tasksChanged()
    } catch (e) {
      const status = errorStatus(e)
      if (status === 409) {
        // Someone else saved this note after we got it. Keep our newest changes and ask what to do.
        conflictJob = pendingSave?.id === id ? pendingSave : job
        if (pendingSave?.id === id) pendingSave = null
        conflict.value = { docId: id, title: titleOf(id), by: errorData<{ by?: OtherEditor | null }>(e)?.by ?? null }
      } else if (!status || status >= 500) {
        // No connection, or a problem on the server: try again soon (newer changes win).
        if (!pendingSave) {
          pendingSave = job
          scheduleSave(5000)
        }
      } else if (status === 404) {
        showNotice('This note could not be saved. Someone may have moved it to the Trash.')
      } else if (status === 413) {
        showNotice('This note is too big to save (50 MB at most). Remove some pictures and try again.')
      } else {
        showNotice('Could not save this note. Try again.')
      }
      if (isOpen()) saveStatus.value = 'unsaved'
    } finally {
      savingId = null
    }
  }

  /** The server has this version of the note now. */
  function gotVersion(id: string, updatedAt: string) {
    versions.set(id, updatedAt)
    if (activeDoc.value?.id === id) activeDoc.value.updatedAt = updatedAt
    const meta = docs.value.find((d) => d.id === id)
    if (meta) meta.updatedAt = updatedAt
  }

  function titleOf(id: string) {
    return docs.value.find((d) => d.id === id)?.title ?? activeDoc.value?.title ?? 'Untitled'
  }

  /** Something here is not saved yet (then we must not replace it with the server's version). */
  function hasUnsaved(id: string) {
    return pendingSave?.id === id || savingId === id || conflictJob?.id === id
  }

  // ---- Opening notes ----

  async function loadDocs() {
    docs.value = await $fetch<DocMeta[]>('/api/documents')
  }

  // Opening one note after the other quickly: only the last one opens.
  let loadsStarted = 0

  /** Open a note. False if it could not be opened (or another note was asked for meanwhile). */
  async function loadDoc(id: string, how: OpenHow = 'push'): Promise<boolean> {
    const n = ++loadsStarted
    let doc: FullDoc
    let now: Awaited<ReturnType<typeof fetchEditors>>
    try {
      await saveNow() // finish saving the open note before switching
      ;[doc, now] = await Promise.all([
        $fetch<FullDoc>(`/api/documents/${id}`),
        fetchEditors(id),
      ])
    } catch (e) {
      if (n === loadsStarted) {
        showNotice(errorStatus(e) === 404
          ? 'This note can\'t be opened. It may have been moved to the Trash.'
          : 'Could not open this note. Check your connection and try again.')
      }
      return false
    }
    if (n !== loadsStarted) return false
    const left = activeDoc.value?.id
    if (left && left !== id) leaveNote(left)
    activeDoc.value = doc
    versions.set(id, doc.updatedAt)
    editorContent.value = (doc.content as Record<string, any>) ?? {}
    saveStatus.value = 'saved'
    // Someone else is editing this note: ask first. The note stays locked until the person chooses.
    editors.value = now?.editors ?? []
    hold.value = editors.value.length ? 'opened' : null
    if (how !== 'none') opts.onOpen?.(id, how)
    return true
  }

  /** Show the newest version of the open note (saved by someone else, or by you in another tab). */
  async function showNewest(id: string) {
    if (hasUnsaved(id)) return
    let doc: FullDoc
    try {
      doc = await $fetch<FullDoc>(`/api/documents/${id}`)
    } catch {
      return
    }
    // Typed something meanwhile, or opened another note: keep that.
    if (activeDoc.value?.id !== id || hasUnsaved(id)) return
    gotVersion(id, doc.updatedAt)
    activeDoc.value.title = doc.title
    const meta = docs.value.find((d) => d.id === id)
    if (meta) meta.title = doc.title
    editorContent.value = (doc.content as Record<string, any>) ?? {}
    reloadKey.value++
  }

  // ---- Who else is editing ----

  async function fetchEditors(id: string) {
    try {
      return await $fetch<{ editors: OtherEditor[]; updatedAt: string }>(
        `/api/documents/${id}/editors`,
        { query: { tab } },
      )
    } catch {
      return null
    }
  }

  /** Tell the server this tab is not editing the note any more. */
  function leaveNote(id: string) {
    // keepalive: it still goes out when the tab is being closed.
    void fetch(`/api/documents/${encodeURIComponent(id)}/editors?tab=${tab}`, { method: 'DELETE', keepalive: true })
      .catch(() => {})
  }

  let checking = false
  async function checkEditors() {
    const id = activeDoc.value?.id
    if (!id || checking || document.visibilityState !== 'visible') return
    if (opts.active && !opts.active()) return
    checking = true
    try {
      const now = await fetchEditors(id)
      if (!now || activeDoc.value?.id !== id) return
      const hadNone = editors.value.length === 0
      editors.value = now.editors
      // Someone started editing the note you have open: tell you once, and ask.
      if (now.editors.length && hadNone && hold.value === null) hold.value = 'started'
      // It was saved somewhere else: show the newest version (if nothing here waits to be saved).
      if (isNewer(now.updatedAt, versions.get(id))) await showNewest(id)
    } finally {
      checking = false
    }
  }

  /** "Edit anyway" / "Keep editing" */
  function editAnyway() {
    hold.value = null
  }

  /** "Just read": the note stays locked and shows the newest version as others save it. */
  function justRead() {
    hold.value = 'reading'
    const id = activeDoc.value?.id
    if (!id) return
    // Changes typed before this still get saved. After that, this tab is not an editor any more.
    void saveNow().then(() => {
      if (activeDoc.value?.id === id && hold.value === 'reading') leaveNote(id)
    })
  }

  /** "Save mine": my version replaces the one someone else saved. */
  function keepMine() {
    const job = conflictJob
    conflict.value = null
    conflictJob = null
    if (job) void queue(() => sendSave(job, true))
  }

  /** "Use theirs": forget my changes that are not saved, and show the newest version. */
  async function takeTheirs() {
    const c = conflict.value
    conflict.value = null
    conflictJob = null
    if (!c) return
    if (pendingSave?.id === c.docId) pendingSave = null
    if (activeDoc.value?.id === c.docId) {
      await showNewest(c.docId)
      saveStatus.value = 'saved'
    }
  }

  /**
   * New note. Logged in: private by default, named with today's date ("9 Nov 2026, Monday").
   * If you already have a note with that name, the server names it "9 Nov 2026, Monday_2" (then _3, …).
   * Logged out: always public.
   */
  async function newDoc(opts: { private?: boolean; how?: OpenHow } = {}) {
    await saveNow()
    const makePrivate = loggedIn.value && (opts.private ?? true)
    let doc: FullDoc
    try {
      doc = await $fetch<FullDoc>('/api/documents', {
        method: 'POST',
        body: { private: makePrivate, title: makePrivate ? noteDateTitle() : undefined },
      })
    } catch (e) {
      // 429 = the daily limit of new notes; the server says what to do.
      showNotice(errorStatus(e) === 429
        ? errorMessage(e) ?? 'You made too many new notes today. Please try again tomorrow.'
        : 'Could not make a new note. Check your connection and try again.')
      return
    }
    docs.value.unshift(doc)
    await loadDoc(doc.id, opts.how ?? 'push')
  }

  // ---- A short message at the top (like "You can make at most 100 new notes a day") ----
  const notice = ref('')
  let noticeTimer: ReturnType<typeof setTimeout> | null = null
  function showNotice(text: string) {
    notice.value = text
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => { notice.value = '' }, 8000)
  }

  /** Turn the view-only link of the open private note on or off. */
  async function setShared(on: boolean) {
    const id = activeDoc.value?.id
    if (!id) return
    const show = (value: boolean) => {
      if (activeDoc.value?.id === id) activeDoc.value.shared = value
      const meta = docs.value.find((d) => d.id === id)
      if (meta) meta.shared = value
    }
    // Show the change right away; put it back if the server says no.
    show(on)
    try {
      await $fetch(`/api/documents/${id}`, { method: 'PUT', body: { shared: on } })
    } catch (e) {
      show(!on)
      console.error('Could not change sharing:', e)
    }
  }

  // Notes being deleted: changes typed in them now are not saved.
  const deleting = new Set<string>()

  /** Delete = move the note to the Trash. It can be restored there for 30 days. */
  async function deleteDoc(id: string) {
    deleting.add(id)
    try {
      // It can come back from the Trash, so first save what was typed in it.
      await saveNow()
      // Someone else saved it meanwhile and we were asking what to do: the Trash keeps their version.
      if (conflict.value?.docId === id) {
        conflict.value = null
        conflictJob = null
      }
      await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
    } catch (e) {
      // 404: it is not there any more (deleted somewhere else), so it goes from here too.
      if (errorStatus(e) !== 404) {
        showNotice('Could not move the note to the Trash. Check your connection and try again.')
        return
      }
    } finally {
      deleting.delete(id)
    }
    // A save of it that waits to try again (no connection before) would only fail now.
    if (pendingSave?.id === id) {
      pendingSave = null
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
    }
    docs.value = docs.value.filter((d) => d.id !== id)
    // Its tasks are hidden now (Daily tasks, Pending).
    void tasksChanged()
    if (activeDoc.value?.id === id) {
      // Open the next note right away (the editor stays, with the undo lists of the other notes).
      const next = docs.value[0]
      if (next && await loadDoc(next.id, 'replace')) return
      activeDoc.value = null
      editorContent.value = {}
      editors.value = []
      hold.value = null
      if (!next) await newDoc({ how: 'replace' })
    }
  }

  /** A note came back from the Trash: show it in the list again. Its tasks are back too. */
  function onRestored(doc: DocMeta) {
    if (!docs.value.some((d) => d.id === doc.id)) {
      docs.value = [...docs.value, doc].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    }
    void tasksChanged()
  }

  function onContentUpdate(content: Record<string, any>) {
    editorContent.value = content
    if (!activeDoc.value || deleting.has(activeDoc.value.id)) return
    // Locked (we are asking first, or the person is only reading): this tab does not save the note.
    if (locked.value) return
    // Changes of another note still waiting? Save them first.
    if (pendingSave && pendingSave.id !== activeDoc.value.id) void saveNow()
    pendingSave = { id: activeDoc.value.id, content }
    scheduleSave(1000)
  }

  /** The editor says there are changes ("Unsaved", then "Saving…"). Not while locked: then nothing is saved. */
  function onEditorSaveStatus(status: 'saved' | 'saving' | 'unsaved') {
    if (!locked.value) saveStatus.value = status
  }

  async function updateTitle(title: string) {
    if (!activeDoc.value) return
    const id = activeDoc.value.id
    activeDoc.value.title = title
    const idx = docs.value.findIndex((d) => d.id === id)
    if (idx >= 0) docs.value[idx]!.title = title
    // In the same line as the saves, so a save never takes this new version for someone else's.
    await saveNow()
    await queue(async () => {
      try {
        const res = await $fetch<{ updatedAt: string }>(`/api/documents/${id}`, {
          method: 'PUT',
          body: { title, tab },
        })
        gotVersion(id, res.updatedAt)
      } catch {
        showNotice('Could not save the new name. Try again.')
      }
    })
  }

  function jumpToHeading(pos: number) {
    editorRef.value?.scrollToPos(pos)
  }

  // Save right away when the page is hidden (other tab, other app, closing).
  // Back to the page: see who is editing now.
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') void saveNow()
    else void checkEditors()
  }

  // The tab is being closed: this tab is not editing any more.
  function onPageHide() {
    if (activeDoc.value) leaveNote(activeDoc.value.id)
  }

  // Back to the notes (from Daily tasks): see who is editing now.
  if (opts.active) {
    watch(opts.active, (on) => { if (on) void checkEditors() })
  }

  let editorsTimer: ReturnType<typeof setInterval> | null = null

  onMounted(async () => {
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)
    editorsTimer = setInterval(() => void checkEditors(), CHECK_EDITORS_MS)
    await loadDocs()
    // The address names a note (/note/<id>, or a link from the task list): open it, if it is one of your notes.
    const wanted = opts.initialDocId
    if (wanted) {
      if (docs.value.some((d) => d.id === wanted)) {
        if (await loadDoc(wanted, 'replace')) return
      } else if (opts.onNotYours?.(wanted)) {
        return
      }
      // Could not open it: open the usual note below.
    }
    // Logged in: start with your newest private note.
    const first = (loggedIn.value && docs.value.find((d) => d.isPrivate)) || docs.value[0]
    if (first) {
      await loadDoc(first.id, 'replace')
    } else {
      await newDoc({ how: 'replace' })
    }
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
    if (editorsTimer) clearInterval(editorsTimer)
    if (noticeTimer) clearTimeout(noticeTimer)
    void saveNow()
    if (activeDoc.value) leaveNote(activeDoc.value.id)
  })

  return {
    notice,
    showNotice,
    docs,
    activeDoc,
    saveStatus,
    editorContent,
    tocHeadings,
    editorRef,
    reloadKey,
    editors,
    hold,
    conflict,
    locked,
    loadDoc,
    newDoc,
    deleteDoc,
    onRestored,
    onContentUpdate,
    updateTitle,
    jumpToHeading,
    setShared,
    editAnyway,
    justRead,
    keepMine,
    takeTheirs,
    onEditorSaveStatus,
  }
}
