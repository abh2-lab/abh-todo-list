// Undo and redo for a board (the Mind map or the Kanban): copies of the whole board, one from
// before each change.

const MAX_UNDO = 100

export function useBoardHistory<T>(opts: {
  /** The board on the screen now. */
  current: () => T
  /** Put a board on the screen (for undo and redo). */
  show: (board: T) => void
  /** After each change, undo and redo: save soon. */
  onChange: () => void
}) {
  let last = undefined as T
  let lastJson = ''
  let undoStack: T[] = []
  let redoStack: T[] = []
  const canUndo = ref(false)
  const canRedo = ref(false)

  function setBase(board: T) {
    lastJson = JSON.stringify(board)
    last = JSON.parse(lastJson) as T
  }

  function update() {
    canUndo.value = undoStack.length > 0
    canRedo.value = redoStack.length > 0
  }

  /** Start from the board on the screen now (after loading it), with nothing to undo. */
  function reset() {
    setBase(opts.current())
    undoStack = []
    redoStack = []
    update()
  }

  /** Call after each change: it can be undone, and it is saved soon. false = nothing changed. */
  function changed(): boolean {
    const json = JSON.stringify(opts.current())
    if (json === lastJson) return false
    undoStack.push(last)
    if (undoStack.length > MAX_UNDO) undoStack.shift()
    redoStack = []
    lastJson = json
    last = JSON.parse(json) as T
    update()
    opts.onChange()
    return true
  }

  function restore(board: T) {
    opts.show(JSON.parse(JSON.stringify(board)) as T)
    setBase(opts.current())
    update()
    opts.onChange()
  }

  /** false = there was nothing to undo. */
  function undo(): boolean {
    const before = undoStack.pop()
    if (before === undefined) return false
    redoStack.push(last)
    restore(before)
    return true
  }

  function redo(): boolean {
    const after = redoStack.pop()
    if (after === undefined) return false
    undoStack.push(last)
    restore(after)
    return true
  }

  /** The board after the last change (a copy: don't change it). */
  function latest(): T {
    return last
  }

  return { canUndo, canRedo, reset, changed, undo, redo, latest }
}
