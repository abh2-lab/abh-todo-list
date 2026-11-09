// Who is logged in (Google login), and logging out.
export function useAccount() {
  const { loggedIn, user, clear } = useUserSession()
  const firstName = computed(() => user.value?.name?.split(' ')[0] || user.value?.email || '')

  async function logout() {
    await clear()
    // Start fresh, so private notes and tasks are gone from the screen.
    window.location.href = '/'
  }

  return { loggedIn, user, firstName, logout, loginUrl: '/auth/google' }
}
