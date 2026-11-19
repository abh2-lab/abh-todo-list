import type { RouterConfig } from '@nuxt/schema'

// Every note has its own address: /note/<id>.
// It is the same page as "/" (pages/index.vue). That page has a fixed key, so going from one
// note to another keeps the page and its editor, and only opens the other note.
export default {
  routes: (scanned) => {
    const home = scanned.find((r) => r.path === '/')
    return home ? [...scanned, { ...home, name: 'note', path: '/note/:id' }] : scanned
  },
} satisfies RouterConfig
