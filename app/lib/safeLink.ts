import Link from '@tiptap/extension-link'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { LINK_REL, isSafeLinkHref } from '#shared/noteContent'

// Links in notes. A note can come from anyone (public notes), so:
// - a link always opens in a new tab and has our look: the target, rel and class
//   saved in a note (or pasted from another site) are not used.
// - a click opens the address the page shows (the library blanks unsafe ones there),
//   never the raw saved one. The library's own click code ("openOnClick") can open the
//   raw saved address when the link text is bold or italic, so we use this one instead.
export const SafeLink = Link.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      target: { default: '_blank', parseHTML: () => '_blank', renderHTML: () => ({ target: '_blank' }) },
      rel: { default: LINK_REL, parseHTML: () => LINK_REL, renderHTML: () => ({ rel: LINK_REL }) },
      class: { default: null, parseHTML: () => null, renderHTML: () => ({}) },
    }
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: new PluginKey('safeLinkClick'),
        props: {
          // While editing, a click on a link opens it in a new tab.
          // (When the note is read-only, the browser opens the link itself.)
          handleClick(view, _pos, event) {
            if (event.button !== 0 || !view.editable) return false
            const link = (event.target as Element | null)?.closest?.('a')
            if (!link || !view.dom.contains(link)) return false
            const href = link.getAttribute('href')
            if (!isSafeLinkHref(href)) return false
            window.open(href, '_blank', 'noopener,noreferrer')
            return true
          },
        },
      }),
    ]
  },
})
