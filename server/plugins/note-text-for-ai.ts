// AI chats and tools (ChatGPT, Claude, Gemini…) often read a page without running its
// JavaScript. This app draws its pages with JavaScript (ssr: false), so they got an empty page.
// Now the view-only page of a note (/doc/<id>) comes with the note's text inside it
// (shared/noteText.ts). People don't see that copy: a style hides it, and the app shows the
// note as before.
// Same rules as the app: only a note this visitor may read (public notes, private notes with
// the view-only link on, and your own notes), never a note in the Trash.
import { and, eq } from 'drizzle-orm'
import { documents } from '../../db/schema'
import { useDb } from '../db'
import { escapeHtml, noteToHtml } from '#shared/noteText'

const NOTE_PAGE = /^\/doc\/([^/]+)\/?$/

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', async (html, { event }) => {
    const match = NOTE_PAGE.exec(event.path.split('?')[0] ?? '')
    if (!match) return
    let id: string
    try {
      id = decodeURIComponent(match[1]!)
    } catch {
      return
    }

    try {
      const { user } = await getUserSession(event)
      const [doc] = await useDb()
        .select({ title: documents.title, content: documents.content, updatedAt: documents.updatedAt })
        .from(documents)
        .where(and(eq(documents.id, id), viewableBy(user?.id)))
      if (!doc) return

      const title = escapeHtml(doc.title.trim() || 'Untitled')
      const edited = doc.updatedAt.toISOString().slice(0, 10)
      html.head.push(`<title>${title}</title>`, '<style>.note-text-for-ai{display:none}</style>')
      html.bodyPrepend.push(
        `<article class="note-text-for-ai"><h1>${title}</h1><p>Last edited: ${edited}</p>${noteToHtml(doc.content)}</article>`,
      )
    } catch (e) {
      // The note can't be read now: the page works as before (the app loads the note itself).
      console.error('[note-text-for-ai] could not add the note text:', e instanceof Error ? e.message : e)
    }
  })
})
