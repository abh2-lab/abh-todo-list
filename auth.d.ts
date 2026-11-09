// The logged-in user we keep in the session cookie (nuxt-auth-utils).
declare module '#auth-utils' {
  interface User {
    id: string
    name: string
    email: string
    avatar: string | null
  }
}

export {}
