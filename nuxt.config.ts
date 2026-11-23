export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',

  modules: ['@nuxtjs/tailwindcss', 'nuxt-auth-utils'],

  tailwindcss: {
    cssPath: '~/assets/main.css',
    configPath: 'tailwind.config',
  },

  css: ['~/assets/main.css'],

  // The Tailwind module adds Tailwind's "nesting" helper, which Nuxt 4 can't load from
  // Tailwind 3 (it only warns). Our CSS has no nested rules, so it is simply turned off.
  postcss: {
    plugins: {
      'tailwindcss/nesting': false,
    },
  },

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

  // Safety headers on every answer from the server:
  // - other sites can't show this app inside a frame (a trick to make people click
  //   things, like "Delete", without knowing)
  // - the browser doesn't guess file types, and doesn't send full page addresses to other sites
  // - no plugins (like Flash), and no camera, microphone or location
  // - search engines don't list any page (the site is for the team; see also public/robots.txt)
  routeRules: {
    '/**': {
      headers: {
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'X-Robots-Tag': 'noindex, nofollow, noarchive',
      },
    },
  },

  // App logo (public/favicon.svg) in the browser tab, plus copies for older browsers and phones
  app: {
    head: {
      // Search engines: don't list this site (the X-Robots-Tag header above says the same).
      meta: [{ name: 'robots', content: 'noindex, nofollow, noarchive' }],
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
        '@tiptap/extension-list',
        '@tiptap/extension-table',
        '@tiptap/extension-link',
        '@tiptap/extension-image',
        '@tiptap/extension-youtube',
        '@tiptap/extension-typography',
        '@tiptap/extensions',
      ],
      exclude: ['@tiptap/pm'],
    },
  },
})
