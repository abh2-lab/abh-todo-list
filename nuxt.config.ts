export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2025-01-01',

  modules: ['@nuxtjs/tailwindcss', 'nuxt-auth-utils'],

  tailwindcss: {
    cssPath: '~/assets/main.css',
    configPath: 'tailwind.config',
  },

  css: ['~/assets/main.css'],

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
    // The login cookie. Without an end date the browser throws it away when it closes,
    // and people have to log in again. Now the browser keeps it for 90 days, and each
    // visit starts the 90 days again (server/plugins/keep-login.ts).
    session: {
      cookie: {
        maxAge: 60 * 60 * 24 * 90, // 90 days, in seconds
      },
    },
  },

  ssr: false,

  // App logo (public/favicon.svg) in the browser tab, plus copies for older browsers and phones
  app: {
    head: {
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '32x32' },
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  vite: {
    optimizeDeps: {
      include: [
        '@tiptap/vue-3',
        '@tiptap/starter-kit',
        '@tiptap/extension-task-list',
        '@tiptap/extension-task-item',
        '@tiptap/extension-image',
        '@tiptap/extension-youtube',
        '@tiptap/extension-typography',
        '@tiptap/extension-placeholder',
      ],
      exclude: ['@tiptap/pm'],
    },
  },
})
