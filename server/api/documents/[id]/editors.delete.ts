// This tab stopped editing the note (it opened another note, chose "Just read", or was closed).
// Only the tab itself knows its random id, so nobody can take someone else off the list.
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const tab = readTab(getQuery(event).tab)
  if (tab) stopEditing(id, tab)
  return { ok: true }
})
