import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '../../db/schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

export function useDb() {
  if (!_db) {
    const config = useRuntimeConfig()
    const connectionString = (config.databaseUrl as string) || process.env.DATABASE_URL
    if (!connectionString) throw createError({ statusCode: 500, message: 'DATABASE_URL is not configured' })
    const pool = new Pool({ connectionString })
    _db = drizzle(pool, { schema })
  }
  return _db
}
