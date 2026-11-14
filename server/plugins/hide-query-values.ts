// A request that fails with a database error is written to the server log. Take the values
// of the failed query out first (server/utils/dbErrors.ts). This runs before the log is
// written, so it must not wait for anything.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    hideQueryValues(error)
  })
})
