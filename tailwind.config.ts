import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

export default {
  darkMode: 'class',
  content: [
    './app/**/*.{vue,ts,tsx}',
    './components/**/*.{vue,ts,tsx}',
    './pages/**/*.vue',
  ],
  theme: {
    extend: {
      colors: {
        surface: {
          0: '#000000',
          1: '#0a0a0a',
          2: '#111111',
          3: '#1a1a1a',
        },
        border: '#1f1f1f',
        accent: '#6366f1',
        'accent-hover': '#4f46e5',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      // Text sizes for the app around the notes (menus, lists, buttons): a little bigger
      // than Tailwind's own (xs was 12px, sm was 14px), so they are easy to read.
      // The note text itself has its own sizes in app/assets/main.css.
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }], // 12px: the smallest labels
        xs: ['0.8125rem', { lineHeight: '1.125rem' }], // 13px
        btn: ['0.875rem', { lineHeight: '1.25rem' }], // 14px: buttons
        sm: ['0.9375rem', { lineHeight: '1.375rem' }], // 15px
      },
    },
  },
  plugins: [typography],
} satisfies Config
