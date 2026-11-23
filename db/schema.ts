import { pgTable, text, json, timestamp, boolean, date, index, integer, primaryKey } from 'drizzle-orm/pg-core'

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
  // Set = the note is in the Trash (since then). It can be restored for 30 days,
  // then it is deleted for good (server/plugins/empty-trash.ts). Empty (null) = not in the Trash.
  deletedAt: timestamp('deleted_at'),
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
  // The day it was done, in the person's own time, like 2026-11-12 (the browser sends it, like `day`).
  // Empty for tasks done before this was added: then the day comes from doneAt.
  doneDay: date('done_day'),
  // The person decided not to do it. A cancelled task is never pending, and it is not done.
  cancelled: boolean('cancelled').notNull().default(false),
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

// Links that show someone's Daily tasks for some months, view only ("Share" in Daily tasks).
// The id is the secret part of the link. Deleting the row ("Stop sharing") turns the link off.
export const taskShares = pgTable('task_shares', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // The first and the last month shown, as their first day: 2026-09-01 … 2026-12-01.
  fromMonth: date('from_month').notNull(),
  toMonth: date('to_month').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => [index('task_shares_user_id_idx').on(t.userId)])

// Groups of notes, like labels. Only their owner sees them. A note can be in many groups,
// and it stays in "My notes" too. Each group has one board: a Mind map of its notes, with
// text, links and files, and lines between them.
export const noteGroups = pgTable('note_groups', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // The board: its cards, lines and where they are (shared/board.ts). Saved as a whole.
  board: json('board').notNull().default({}),
  // Goes up by one at each save of the board. A save says which number it started from,
  // so two tabs never write over each other's changes without knowing.
  boardVersion: integer('board_version').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [index('note_groups_user_id_idx').on(t.userId)])

// Which notes are in which group.
export const groupNotes = pgTable('group_notes', {
  groupId: text('group_id').notNull().references(() => noteGroups.id, { onDelete: 'cascade' }),
  docId: text('doc_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  addedAt: timestamp('added_at').notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.groupId, t.docId] }),
  index('group_notes_doc_id_idx').on(t.docId),
])

export type User = typeof users.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
