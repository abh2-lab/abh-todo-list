import { and, eq } from 'drizzle-orm'
import { useDb } from '../../../db'
import { documents } from '../../../../db/schema'

// One note in the Trash, to read it (view only) before restoring it.
// Same rule as the Trash list: public notes for everyone, private notes only for their owner.
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const { user } = await getUserSession(event)
  const [doc] = await useDb()
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), trashOf(user?.id)))
  // Same answer for "not in the Trash", "does not exist" and "private": we don't tell which ids exist.
  if (!doc) throw createError({ statusCode: 404, message: 'This note is not in the Trash.' })
  const { deletedAt, ...rest } = doc
  return { ...toClientDoc(rest), deletedAt: deletedAt!, purgeAt: purgeTime(deletedAt!) }
})
