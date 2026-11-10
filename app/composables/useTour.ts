// The help tour: a few steps that show the parts of the app.
// It opens by itself once for someone new (we remember it in this browser),
// and any time from the Help button.
const SEEN_KEY = 'tour-seen'

export function useTour() {
  const open = useState('tour-open', () => false)
  const step = useState('tour-step', () => 0)

  /** Has this browser seen the tour already? */
  function seen() {
    try {
      return localStorage.getItem(SEEN_KEY) === '1'
    } catch {
      return true // the browser keeps nothing (private window): do not open it by itself every time
    }
  }

  function start() {
    step.value = 0
    open.value = true
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // nothing to do
    }
  }

  function close() {
    open.value = false
  }

  return { open, step, start, close, seen }
}
