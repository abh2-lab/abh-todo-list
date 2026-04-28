import { randomUUID } from 'node:crypto'
import { useDb } from '../../db'
import { documents } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const body = (await readBody(event).catch(() => ({}))) ?? {}
  const db = useDb()
  const [doc] = await db
    .insert(documents)
    .values({
      id: randomUUID(),
      title: body.title ?? 'Untitled',
      content: body.content ?? {},
    })
    .returning()
  return doc
})
