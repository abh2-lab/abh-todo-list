// A board saves by itself a moment after each change, and tries again a bit later when that
// did not work (no connection, for example).

export type SaveState = 'saved' | 'waiting' | 'saving' | 'error'

export function useBoardSaving(opts: {
  /** Save the board as it is now. Throws when it did not work. */
  send: () => Promise<void>
  /** The server said 409: the board was saved somewhere else first (another tab). */
  onConflict: () => Promise<void>
}) {
  const saveState = ref<SaveState>('saved')
  let changeNo = 0
  let savedNo = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let running: Promise<void> | null = null

  /** Call after each change. */
  function markUnsaved() {
    changeNo++
    saveState.value = 'waiting'
    queueSave(800)
  }

  function queueSave(ms: number) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void saveNow()
    }, ms)
  }

  /** Save now. true = everything is saved. */
  async function saveNow(): Promise<boolean> {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    while (running) await running
    if (changeNo === savedNo) return true
    running = sendOnce()
    await running
    running = null
    return changeNo === savedNo
  }

  async function sendOnce() {
    const no = changeNo
    saveState.value = 'saving'
    try {
      await opts.send()
      savedNo = no
      if (changeNo === savedNo) saveState.value = 'saved'
      else {
        saveState.value = 'waiting'
        queueSave(800)
      }
    } catch (e) {
      if (errorStatus(e) === 409) {
        // Saved somewhere else: what was not saved here is dropped, and the newer board is shown.
        savedNo = changeNo
        saveState.value = 'saved'
        await opts.onConflict()
        return
      }
      saveState.value = 'error'
      queueSave(5000)
    }
  }

  /** Every change is saved. */
  function allSaved() {
    return changeNo === savedNo
  }

  const saveText = computed(() => {
    if (saveState.value === 'error') return 'Not saved: trying again…'
    if (saveState.value === 'saved') return 'Saved'
    return 'Saving…'
  })

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { saveState, saveText, markUnsaved, saveNow, allSaved }
}
