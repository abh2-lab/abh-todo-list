// When a $fetch fails: what the server answered.

/** The status number, like 404 or 429. */
export function errorStatus(e: unknown): number | undefined {
  const x = e as { statusCode?: number; status?: number } | null
  return x?.statusCode ?? x?.status
}

/** The server's own message, like "You can make at most 100 new notes a day…". */
export function errorMessage(e: unknown): string | undefined {
  const message = (e as { data?: { message?: unknown } } | null)?.data?.message
  return typeof message === 'string' && message ? message : undefined
}

/** Extra facts the server sent with the error (createError's `data`). */
export function errorData<T>(e: unknown): T | undefined {
  return (e as { data?: { data?: T } } | null)?.data?.data
}
