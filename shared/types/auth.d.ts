// The logged-in user we keep in the session cookie (nuxt-auth-utils).
// It lives in shared/types so both the app and the server code know it (Nuxt 4 checks
// them separately, and the server check doesn't read .d.ts files at the top folder).
declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string
    avatar: string | null
  }
}

export {}
