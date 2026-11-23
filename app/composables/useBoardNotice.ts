// A short message at the bottom of a board (with "Undo" after deleting), for some seconds.

export interface BoardNotice {
  text: string
  /** Show an Undo button. */
  undo?: boolean
  error?: boolean
}

export type TellFn = (text: string, opts?: { undo?: boolean; error?: boolean }) => void

export function useBoardNotice() {
  const notice = ref<BoardNotice | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  const tell: TellFn = (text, opts = {}) => {
    notice.value = { text, ...opts }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => (notice.value = null), opts.error ? 10000 : 8000)
  }

  onBeforeUnmount(() => {
    if (timer) clearTimeout(timer)
  })

  return { notice, tell }
}
