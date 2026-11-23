// Leaving a board (another page, the other board of the group, or closing the tab): save first.
// While files are uploading, or when the last changes could not be saved, ask before leaving.
export function useSaveBeforeLeaving(opts: {
  saveNow: () => Promise<boolean>
  /** Something is not saved yet (a change, or words being written). */
  unsaved: () => boolean
  uploading: () => boolean
}) {
  function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!opts.unsaved() && !opts.uploading()) return
    void opts.saveNow()
    e.preventDefault()
    e.returnValue = ''
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') void opts.saveNow()
  }

  async function beforeLeave() {
    if (opts.uploading() && !window.confirm('Some files are still uploading. Leave anyway? They will not be put on the board.')) return false
    // Writing in a card: keep what was written.
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await nextTick()
    if (await opts.saveNow()) return true
    return window.confirm('Your last changes to this board are not saved yet (no connection?). Leave anyway?')
  }

  onBeforeRouteLeave(beforeLeave)
  onBeforeRouteUpdate(beforeLeave)

  onMounted(() => {
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibility)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', onBeforeUnload)
    document.removeEventListener('visibilitychange', onVisibility)
  })
}
