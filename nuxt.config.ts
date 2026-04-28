export default defineNuxtConfig({
  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2025-01-01',

  modules: ['@nuxtjs/tailwindcss'],

  tailwindcss: {
    cssPath: '~/assets/main.css',
    configPath: 'tailwind.config',
  },

  css: ['~/assets/main.css'],

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL,
  },

  ssr: false,

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
