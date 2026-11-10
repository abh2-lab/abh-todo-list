/**
 * The browser tab title: "Rohit - 10 Nov 2026, Tuesday" (your first name, then the page).
 * When nobody is logged in, it is only the page name.
 */
export function usePageTitle(page: () => string) {
  const { loggedIn, firstName } = useAccount()
  useHead(() => {
    const name = page()
    return { title: loggedIn.value && firstName.value ? `${firstName.value} - ${name}` : name }
  })
}
