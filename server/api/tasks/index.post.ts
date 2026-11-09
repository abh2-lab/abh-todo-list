import { useDb } from '../../db'
import { tasks } from '../../../db/schema'

// Add a task: { text, day }
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const body = (await readBody(event)) ?? {}
  const [task] = await useDb()
    .insert(tasks)
    .values({ userId: user.id, text: readTaskText(body.text), day: readDay(body.day) })
    .returning(taskColumns)
  return task
})
