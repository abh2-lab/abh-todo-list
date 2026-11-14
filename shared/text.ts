// The database (PostgreSQL) can't save the "null" character (\u0000) in text: a save
// with it fails with a server error. You can't see it or type it, but it can come in
// when you paste text from some programs. So we take it out before saving.

/** The same text, without "null" characters (\u0000). */
export function withoutNul(text: string): string {
  return text.replaceAll('\u0000', '')
}
