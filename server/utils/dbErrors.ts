// Since Drizzle 0.44, when a database query fails, its error holds the SQL and every value
// sent with it: for a save that is the whole note, for a login the person's name and email.
// Those must not go into the server log (notes can be private, and very long).
// hideQueryValues() takes the values out of such an error; the SQL and the reason stay.

const START = 'Failed query: '
const VALUES = '\nparams: '
const HIDDEN = '(not logged)'

/** Takes the values out of a failed query's error (in place), and gives the same error back. */
export function hideQueryValues<T>(error: T): T {
  if (!(error instanceof Error) || !error.message.startsWith(START)) return error
  const message = error.message
  const at = message.indexOf(VALUES)
  if (at === -1) return error
  const safe = `${message.slice(0, at)}${VALUES}${HIDDEN}`
  try {
    // The stack starts with the message, so it has the values too.
    const stack = error.stack
    error.message = safe
    if (typeof stack === 'string') {
      const i = stack.indexOf(message)
      Object.defineProperty(error, 'stack', {
        value: i === -1 ? `${error.name}: ${safe}` : stack.slice(0, i) + safe + stack.slice(i + message.length),
        writable: true,
        configurable: true,
      })
    }
    // Drizzle's own error also keeps them as a list.
    if ('params' in error) (error as { params: unknown }).params = HIDDEN
  } catch {
    // Could not change this error; nothing more to do.
  }
  return error
}
