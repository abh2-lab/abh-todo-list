import { pgTable, text, json, timestamp, boolean, date, index } from 'drizzle-orm/pg-core'

// People who logged in with Google.
export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  googleId: text('google_id').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').notNull().default(''),
  avatar: text('avatar'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const documents = pgTable('documents', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull().default('Untitled'),
  content: json('content').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // Empty (null) = public note: everyone can see and edit it.
  // Set = private note: only this user can see and edit it.
  userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  // A private note with shared = true can be viewed (not edited) by anyone with the link.
  shared: boolean('shared').notNull().default(false),
}, (t) => [index('documents_user_id_idx').on(t.userId)])

// Daily tasks. Every task belongs to one person and one day.
// A task is "pending" when its day is over (after midnight) and it is still not done.
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  // The day the task is planned for, in the person's own time, like 2026-11-09.
  day: date('day').notNull(),
  done: boolean('done').notNull().default(false),
  doneAt: timestamp('done_at'),
  // If the task was moved to another day: the first day it was planned for.
  movedFrom: date('moved_from'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  // The note the task line is in ("Today's task" button). The line carries the task id.
  docId: text('doc_id').references(() => documents.id, { onDelete: 'cascade' }),
  // false = the line was deleted from the note, so the task is hidden.
  // It shows again if the line comes back (for example with undo).
  inNote: boolean('in_note').notNull().default(true),
}, (t) => [
  index('tasks_user_day_idx').on(t.userId, t.day),
  index('tasks_doc_id_idx').on(t.docId),
])

export type User = typeof users.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
