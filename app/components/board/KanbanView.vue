<script setup lang="ts">
import { ArrowLeftIcon, ArrowRightIcon, FileTextIcon, LinkIcon, PlusIcon, Redo2Icon, Undo2Icon, UploadIcon } from '@lucide/vue'
import '~/assets/board.css'
import { MAX_CARDS, MAX_FILE_NAME, MAX_LABEL, isBoardImage, newBoardId, type BoardColor, type CardContent } from '#shared/board'
import { DEFAULT_COLUMNS, MAX_COLUMNS, cleanColumnName, kanbanCards, type KanbanColumn, type KanbanData } from '#shared/kanban'
import { youtubeSrc } from '#shared/noteContent'
import { COLORS, isTypingIn, notesOffText, pastedForBoard, youtubeId } from '~/lib/board'
import { downloadBoardFile, openBoardFile, type UploadedFile } from '~/lib/boardFiles'
import type { DocMeta } from '~/types/docs'
import type { FullGroup } from '~/types/groups'
import BoardHeader from './BoardHeader.vue'
import KanbanCard from './KanbanCard.vue'
import KanbanColumnHead from './KanbanColumnHead.vue'
import LinkDialog from './LinkDialog.vue'
import NotePicker from './NotePicker.vue'
import NoteReader from './NoteReader.vue'
import NoticeBar from './NoticeBar.vue'
import SelectionBar from './SelectionBar.vue'

// The Kanban of a group: columns (To learn, Learning, Done… they can be renamed, colored, moved,
// added and deleted) with cards in them, top to bottom. Drag cards from column to column and up
// and down; drag a column by its name. (The group's other board is the Mind map: BoardView.vue.)
// It saves by itself a moment after each change. Ctrl+Z / Ctrl+Y undo and redo.
//
// Like on the Mind map, the notes in the group decide which note cards there are: every note in
// the group has a card (new ones go to the end of the first column), and taking a note card off
// takes the note out of the group (the note itself stays). Cards of notes in the Trash keep
// their place, hidden, until the note is back.
const props = defineProps<{ groupId: string }>()

/** Kinds of drag data for cards and columns moved on this page (so they are never taken for files). */
const CARD_DRAG = 'application/x-board-card'
const COLUMN_DRAG = 'application/x-board-column'

const header = ref<InstanceType<typeof BoardHeader> | null>(null)
/** Everything under the header and left of the note reader (for the Delete key). */
const area = ref<HTMLElement | null>(null)
/** The columns, side by side. */
const row = ref<HTMLElement | null>(null)
const name = ref('')
const loaded = ref(false)
const loadError = ref<'gone' | 'failed' | null>(null)
const { notice, tell } = useBoardNotice()
const { notes, members, setNotes, inTrash, syncMembers, addNote, newNote } = useBoardNotes(props.groupId, tell)
const columns = ref<KanbanColumn[]>([])
/** The Kanban's save number on the server. */
let version = 0

const selectedIds = ref<string[]>([])
/** The text card being written in, or the card whose name is being written. */
const editingId = ref<string | null>(null)
const renamingColumnId = ref<string | null>(null)
const readingId = ref<string | null>(null)
const pickerOpen = ref(false)
const pickerIds = ref<string[]>([])
const linkOpen = ref(false)
/** The column that "Add a note / link / file" puts the card in (null: the first column). */
let addTo: string | null = null

usePageTitle(() => name.value || 'Board')

// ---- The board as data ----

function current(): KanbanData {
  return { columns: columns.value }
}

/** Put a Kanban on the screen (when it is loaded, and for undo and redo). */
function show(kanban: KanbanData) {
  editingId.value = null
  renamingColumnId.value = null
  columns.value = kanban.columns
  const ids = new Set(kanbanCards(kanban).map((c) => c.id))
  selectedIds.value = selectedIds.value.filter((id) => ids.has(id))
}

/** The cards shown in each column. Cards of notes in the Trash keep their place, but are not shown. */
const shownCards = computed(() => new Map(columns.value.map((col) => [col.id, col.cards.filter((c) => !(c.kind === 'note' && inTrash(c.docId)))])))

function shownIn(column: KanbanColumn): CardContent[] {
  return shownCards.value.get(column.id) ?? []
}

function columnById(id: string | null | undefined): KanbanColumn | undefined {
  return id ? columns.value.find((c) => c.id === id) : undefined
}

function findCard(id: string): { column: KanbanColumn; index: number; card: CardContent } | null {
  for (const column of columns.value) {
    const index = column.cards.findIndex((c) => c.id === id)
    if (index >= 0) return { column, index, card: column.cards[index]! }
  }
  return null
}

// ---- Saving, and undo and redo ----
const { saveState, saveText, markUnsaved, saveNow, allSaved } = useBoardSaving({
  send: async () => {
    const saved = await $fetch<{ kanbanVersion: number }>(`/api/groups/${encodeURIComponent(props.groupId)}`, {
      method: 'PUT',
      body: { kanban: current(), kanbanVersion: version },
    })
    version = saved.kanbanVersion
  },
  onConflict: async () => {
    tell('This board was changed in another tab or window, so it was loaded again.', { error: true })
    await load()
  },
})

const history = useBoardHistory<KanbanData>({ current, show, onChange: markUnsaved })
const { canUndo, canRedo } = history
/** Call after each change: it can be undone, and it is saved soon. */
const changed = history.changed

/** Keep the group's notes the same as the note cards on the board (after taking cards off, undo and redo). */
function syncNoteCards() {
  return syncMembers(() => kanbanCards(history.latest()).flatMap((c) => (c.kind === 'note' && c.docId ? [c.docId] : [])))
}

function undo() {
  if (!history.undo()) return
  notice.value = null
  void syncNoteCards()
}

function redo() {
  if (history.redo()) void syncNoteCards()
}

// ---- Loading ----
async function load() {
  let g: FullGroup
  try {
    g = await $fetch<FullGroup>(`/api/groups/${encodeURIComponent(props.groupId)}`)
  } catch (e) {
    if (!loaded.value) loadError.value = errorStatus(e) === 404 ? 'gone' : 'failed'
    else tell('Could not load the board. Check your connection.', { error: true })
    return
  }
  name.value = g.name
  version = g.kanbanVersion
  setNotes(g.notes)

  // A new Kanban gets its first columns. Cards of notes taken out of the group (from the notes
  // list or the Mind map) go away.
  const cols: KanbanColumn[] = g.kanban.columns.length
    ? g.kanban.columns.map((col) => ({ ...col, cards: col.cards.filter((c) => c.kind !== 'note' || (c.docId && members.has(c.docId))) }))
    : DEFAULT_COLUMNS.map((d) => ({ id: newBoardId(), name: d.name, ...(d.color ? { color: d.color } : {}), cards: [] }))
  // Notes put in the group there get a card at the end of the first column.
  const onBoard = new Set(cols.flatMap((col) => col.cards.map((c) => c.docId)))
  for (const n of g.notes) {
    if (!n.inTrash && !onBoard.has(n.id)) cols[0]!.cards.push({ id: newBoardId(), kind: 'note', docId: n.id })
  }

  const kanban: KanbanData = { columns: cols }
  show(kanban)
  history.reset()
  loaded.value = true
  if (JSON.stringify(kanban) !== JSON.stringify(g.kanban)) markUnsaved()
}

// ---- Adding cards ----

function roomForCard() {
  if (kanbanCards(current()).length < MAX_CARDS) return true
  tell(`A board can have at most ${MAX_CARDS} cards.`, { error: true })
  return false
}

/** The column for a note, link or file being added (see addTo). */
function targetColumn(): KanbanColumn {
  return columnById(addTo) ?? columns.value[0]!
}

/** Put a new card in a column (at the end, or before the card beforeId) and scroll to it. */
function putCard(card: CardContent, column: KanbanColumn, beforeId?: string | null) {
  const at = beforeId ? column.cards.findIndex((c) => c.id === beforeId) : -1
  if (at >= 0) column.cards.splice(at, 0, card)
  else column.cards.push(card)
  nextTick(() => scrollToCard(card.id))
}

function scrollToCard(id: string) {
  row.value?.querySelector(`[data-card-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** A new text card in a column (the first one, from the button at the top). Without words, it is ready to write in. */
function addText(column = columns.value[0], text = '') {
  if (!loaded.value || !column || !roomForCard()) return
  const card: CardContent = { id: newBoardId(), kind: 'text', text }
  putCard(card, column)
  // An empty one is not a change yet: it goes away when you stop writing.
  if (text) changed()
  else editingId.value = card.id
}

function editText(id: string) {
  editingId.value = id
}

function doneText(id: string, text: string | null) {
  if (editingId.value === id) editingId.value = null
  const found = findCard(id)
  if (!found) return
  const { column, index, card } = found
  const before = card.text ?? ''
  const now = text ?? before
  if (card.kind === 'text' && !now.trim()) {
    // An empty text card is not kept.
    column.cards.splice(index, 1)
    changed()
    if (before.trim()) tell('The empty card was deleted.', { undo: true })
    return
  }
  // Link, video, picture and file cards: their name (none = the address or file name shows).
  if (text !== null) {
    if (text) card.text = text
    else delete card.text
  }
  changed()
}

/** A card for a web address: a video card for a YouTube video, a link card for the rest. */
function addLink(url: string, linkName = '', column = targetColumn()) {
  linkOpen.value = false
  if (!loaded.value || !column || !roomForCard()) return
  const card: CardContent = { id: newBoardId(), kind: youtubeSrc(url) && youtubeId(url) ? 'video' : 'link', url }
  if (linkName) card.text = linkName.slice(0, MAX_LABEL)
  putCard(card, column)
  changed()
}

function openLinkDialog(column?: KanbanColumn) {
  addTo = column?.id ?? null
  linkOpen.value = true
}

// Pictures and files: their card goes in a column, before a card (or at the end).
interface FilePlace {
  columnId: string
  beforeId: string | null
}

const uploads = useBoardUploads<FilePlace>({ groupId: props.groupId, hasRoom: roomForCard, place: addFileCard, tell })
const { uploadText } = uploads

function addFiles(files: File[], where: FilePlace) {
  if (loaded.value) uploads.addFiles(files, where)
}

function pickFiles(column?: KanbanColumn) {
  addTo = column?.id ?? null
  header.value?.pickFiles()
}

function onFilesPicked(files: File[]) {
  addFiles(files, { columnId: targetColumn().id, beforeId: null })
}

/** The card for an uploaded file: a picture card for pictures, a file card for the rest. */
function addFileCard(f: UploadedFile, where?: FilePlace) {
  // (The column may have been deleted while the file was uploading.)
  const column = columnById(where?.columnId) ?? columns.value[0]
  if (!column) return
  putCard(
    {
      id: newBoardId(),
      kind: isBoardImage(f.type) ? 'image' : 'file',
      fileId: f.id,
      fileName: f.name.slice(0, MAX_FILE_NAME),
      fileType: f.type,
      fileSize: f.size,
    },
    column,
    where?.beforeId,
  )
  changed()
}

// Notes.
function openPicker(column?: KanbanColumn) {
  addTo = column?.id ?? null
  pickerIds.value = [...members]
  pickerOpen.value = true
}

async function pickNote(doc: DocMeta) {
  pickerOpen.value = false
  const columnId = targetColumn()?.id
  if (members.has(doc.id) || !roomForCard()) return
  if (!(await addNote(doc))) return
  // (Found again: the board may have been loaded again meanwhile.)
  const column = columnById(columnId) ?? columns.value[0]
  if (!column) return
  putCard({ id: newBoardId(), kind: 'note', docId: doc.id }, column)
  changed()
}

async function createNote(title: string) {
  pickerOpen.value = false
  const doc = await newNote(title)
  if (doc) await pickNote(doc)
}

// ---- What is selected (the bar at the top) ----
const selectedSet = computed(() => new Set(selectedIds.value))
const selectedCards = computed(() => kanbanCards(current()).filter((c) => selectedSet.value.has(c.id)))
/** The places (left to right) of the columns that have selected cards. */
const selectedColumns = computed(() => columns.value.flatMap((col, i) => (col.cards.some((c) => selectedSet.value.has(c.id)) ? [i] : [])))

function onCardClick(e: MouseEvent, card: CardContent) {
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    selectedIds.value = selectedSet.value.has(card.id) ? selectedIds.value.filter((id) => id !== card.id) : [...selectedIds.value, card.id]
  } else if (selectedIds.value.length !== 1 || selectedIds.value[0] !== card.id) {
    selectedIds.value = [card.id]
  }
}

/** A click on an empty place: nothing selected. */
function onAreaClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (!t?.closest('[data-card-id], [data-keep-selection], button, a, input, textarea')) selectedIds.value = []
}

function setColor(color: BoardColor) {
  for (const card of selectedCards.value) {
    if (color === 'gray') delete card.color
    else card.color = color
  }
  changed()
}

function toggleTopic() {
  const card = selectedCards.value[0]
  if (card?.kind !== 'text') return
  if (card.style === 'topic') delete card.style
  else card.style = 'topic'
  changed()
}

/** Text card: write in it. Link, video, picture and file cards: give them a name. */
function writeSelected() {
  const card = selectedCards.value[0]
  if (card && card.kind !== 'note') editText(card.id)
}

function openUrl(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function openFile(card: CardContent) {
  if (card.fileId) openBoardFile(card.fileId)
}

function downloadFile(card: CardContent) {
  if (card.fileId) downloadBoardFile(card.fileId, card.fileName)
}

function canMove(step: -1 | 1) {
  return selectedColumns.value.some((i) => !!columns.value[i + step])
}

function moveTitle(step: -1 | 1) {
  const [only] = selectedColumns.value
  const to = selectedColumns.value.length === 1 && only !== undefined ? columns.value[only + step] : undefined
  if (to) return `Move to "${to.name}"`
  return step < 0 ? 'Move to the column on the left' : 'Move to the column on the right'
}

/** The selected cards go to the end of the column next to theirs. */
function moveSelected(step: -1 | 1) {
  const cols = columns.value
  const moves: { card: CardContent; from: KanbanColumn; to: KanbanColumn }[] = []
  cols.forEach((from, i) => {
    const to = cols[i + step]
    if (to) for (const card of from.cards) if (selectedSet.value.has(card.id)) moves.push({ card, from, to })
  })
  if (!moves.length) return
  for (const { card, from, to } of moves) {
    from.cards.splice(from.cards.indexOf(card), 1)
    to.cards.push(card)
  }
  changed()
  nextTick(() => scrollToCard(moves[0]!.card.id))
}

/** Delete cards. Note cards are taken off (the note goes out of the group, but stays in the notes list). */
function removeCards(ids: string[]) {
  const gone = new Set(ids)
  let count = 0
  let notesOff = 0
  for (const column of columns.value) {
    const keep = column.cards.filter((c) => {
      if (!gone.has(c.id)) return true
      count++
      if (c.kind === 'note') notesOff++
      return false
    })
    if (keep.length !== column.cards.length) column.cards = keep
  }
  if (!count) return
  selectedIds.value = selectedIds.value.filter((id) => !gone.has(id))
  if (editingId.value && gone.has(editingId.value)) editingId.value = null
  changed()
  void syncNoteCards()
  tell(notesOff ? notesOffText(notesOff) : 'Deleted.', { undo: true })
}

function removeSelected() {
  removeCards(selectedIds.value)
}

// ---- Columns ----

function addColumn() {
  if (!loaded.value) return
  if (columns.value.length >= MAX_COLUMNS) {
    tell(`A Kanban can have at most ${MAX_COLUMNS} columns.`, { error: true })
    return
  }
  const column: KanbanColumn = { id: newBoardId(), name: 'New column', cards: [] }
  columns.value.push(column)
  changed()
  renamingColumnId.value = column.id
  nextTick(() => row.value?.scrollTo({ left: row.value.scrollWidth }))
}

function renameColumn(id: string, newName: string | null) {
  if (renamingColumnId.value === id) renamingColumnId.value = null
  const column = columnById(id)
  const clean = cleanColumnName(newName)
  if (!column || !clean || clean === column.name) return
  column.name = clean
  changed()
}

function setColumnColor(id: string, color: BoardColor) {
  const column = columnById(id)
  if (!column) return
  if (color === 'gray') delete column.color
  else column.color = color
  changed()
}

/** Move a column to place `to` (0 = first). */
function moveColumn(id: string, to: number) {
  const from = columns.value.findIndex((c) => c.id === id)
  if (from < 0 || to < 0 || to >= columns.value.length || to === from) return
  const [column] = columns.value.splice(from, 1)
  columns.value.splice(to, 0, column!)
  changed()
}

/** Delete a column with its cards (Ctrl+Z brings them back). A Kanban keeps at least one column. */
function deleteColumn(id: string) {
  const index = columns.value.findIndex((c) => c.id === id)
  const column = columns.value[index]
  if (!column) return
  if (columns.value.length <= 1) {
    tell('A Kanban needs at least one column.', { error: true })
    return
  }
  const shown = shownIn(column)
  const notesOff = shown.filter((c) => c.kind === 'note').length
  const hadNotes = column.cards.some((c) => c.kind === 'note')
  columns.value.splice(index, 1)
  const gone = new Set(column.cards.map((c) => c.id))
  selectedIds.value = selectedIds.value.filter((cid) => !gone.has(cid))
  changed()
  if (hadNotes) void syncNoteCards()
  const cards = shown.length === 1 ? 'its card' : `its ${shown.length} cards`
  let text = shown.length ? `The column "${column.name}" was deleted, with ${cards}.` : `The column "${column.name}" was deleted.`
  if (notesOff) text += notesOff === 1 ? ' Its note left the group, but it is still in your notes list.' : ' Its notes left the group, but they are still in your notes list.'
  tell(text, { undo: true })
}

// ---- Dragging cards and columns (and files from the computer) ----

/** What is being dragged, for the drag handlers (they run before the screen shows it). */
let dragCard: string | null = null
let dragColumn: string | null = null
/** The same, for the look: set a moment later, so the picture that follows the mouse is not faded. */
const draggedCardId = ref<string | null>(null)
const draggedColumnId = ref<string | null>(null)
let lookTimer: ReturnType<typeof setTimeout> | null = null
/** Where a dragged card (or files) would go: a column, before a card (null: at the end). */
const cardDrop = ref<{ columnId: string; beforeId: string | null } | null>(null)
/** Where a dragged column would go: before a column (null: at the end). */
const columnDrop = ref<{ beforeId: string | null } | null>(null)

function hasFiles(e: DragEvent) {
  return !!e.dataTransfer?.types.includes('Files')
}

function onCardDragStart(e: DragEvent, card: CardContent) {
  if (!e.dataTransfer || editingId.value === card.id) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(CARD_DRAG, card.id)
  dragCard = card.id
  lookTimer = setTimeout(() => (draggedCardId.value = card.id), 0)
}

function onColumnDragStart(e: DragEvent, column: KanbanColumn) {
  if (!e.dataTransfer || renamingColumnId.value === column.id) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(COLUMN_DRAG, column.id)
  // The picture that follows the mouse: the whole column, not only its name.
  const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-column-id]')
  if (el) {
    const r = el.getBoundingClientRect()
    e.dataTransfer.setDragImage(el, e.clientX - r.left, e.clientY - r.top)
  }
  dragColumn = column.id
  lookTimer = setTimeout(() => (draggedColumnId.value = column.id), 0)
}

function onDragEnd() {
  if (lookTimer) clearTimeout(lookTimer)
  lookTimer = null
  dragCard = null
  dragColumn = null
  draggedCardId.value = null
  draggedColumnId.value = null
  cardDrop.value = null
  columnDrop.value = null
}

/** The card the dragged one would go before: the first one whose middle is below the mouse (null: none, the end). */
function cardBefore(columnEl: HTMLElement, y: number): string | null {
  for (const el of columnEl.querySelectorAll<HTMLElement>('[data-card-id]')) {
    const id = el.dataset.cardId!
    if (id === dragCard) continue
    const r = el.getBoundingClientRect()
    if (y < r.top + r.height / 2) return id
  }
  return null
}

function onColumnDragOver(e: DragEvent, column: KanbanColumn) {
  const files = !dragCard && !dragColumn && hasFiles(e)
  // (A column being dragged: the row of columns takes care of it.)
  if (!dragCard && !files) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = files ? 'copy' : 'move'
  const beforeId = cardBefore(e.currentTarget as HTMLElement, e.clientY)
  if (cardDrop.value?.columnId !== column.id || cardDrop.value.beforeId !== beforeId) cardDrop.value = { columnId: column.id, beforeId }
}

function onColumnDragLeave(e: DragEvent, column: KanbanColumn) {
  const to = e.relatedTarget as Node | null
  if (to && (e.currentTarget as HTMLElement).contains(to)) return
  if (cardDrop.value?.columnId === column.id) cardDrop.value = null
}

function onColumnDrop(e: DragEvent, column: KanbanColumn) {
  const files = !dragCard && !dragColumn && hasFiles(e)
  if (!dragCard && !files) return
  e.preventDefault()
  e.stopPropagation()
  const beforeId = cardBefore(e.currentTarget as HTMLElement, e.clientY)
  const id = dragCard
  onDragEnd()
  if (files) addFiles([...(e.dataTransfer?.files ?? [])], { columnId: column.id, beforeId })
  else if (id) moveCard(id, column.id, beforeId)
}

/** Move a card to a column, before a card (null: at the end). */
function moveCard(id: string, columnId: string, beforeId: string | null) {
  const found = findCard(id)
  const to = columnById(columnId)
  if (!found || !to || beforeId === id) return
  // Let go right where it was: nothing to do.
  if (found.column === to && nextShown(to, id) === beforeId) return
  found.column.cards.splice(found.index, 1)
  const at = beforeId ? to.cards.findIndex((c) => c.id === beforeId) : -1
  if (at >= 0) to.cards.splice(at, 0, found.card)
  else to.cards.push(found.card)
  changed()
}

/** The id of the card shown after this one in its column (null: it is the last). */
function nextShown(column: KanbanColumn, id: string): string | null {
  const shown = shownIn(column)
  const k = shown.findIndex((c) => c.id === id)
  return k >= 0 ? (shown[k + 1]?.id ?? null) : null
}

/** A dragged card would go right back where it is: no line to show. */
const cardDropIsSame = computed(() => {
  const d = cardDrop.value
  const id = draggedCardId.value
  if (!d || !id) return false
  const column = columnById(d.columnId)
  return !!column && column.cards.some((c) => c.id === id) && nextShown(column, id) === d.beforeId
})

function dropLineBefore(column: KanbanColumn, card: CardContent) {
  const d = cardDrop.value
  return !!d && !cardDropIsSame.value && d.columnId === column.id && d.beforeId === card.id
}

function dropLineAfter(column: KanbanColumn, card: CardContent) {
  const d = cardDrop.value
  if (!d || cardDropIsSame.value || d.columnId !== column.id || d.beforeId !== null) return false
  const shown = shownIn(column)
  return shown[shown.length - 1]?.id === card.id
}

/** The column the dragged one would go before (null: the end). */
function columnBefore(x: number): string | null {
  for (const el of row.value?.querySelectorAll<HTMLElement>(':scope > [data-column-id]') ?? []) {
    const id = el.dataset.columnId!
    if (id === dragColumn) continue
    const r = el.getBoundingClientRect()
    if (x < r.left + r.width / 2) return id
  }
  return null
}

function onRowDragOver(e: DragEvent) {
  if (!dragColumn) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  const beforeId = columnBefore(e.clientX)
  if (columnDrop.value?.beforeId !== beforeId) columnDrop.value = { beforeId }
}

function onRowDragLeave(e: DragEvent) {
  const to = e.relatedTarget as Node | null
  if (!to || !row.value?.contains(to)) columnDrop.value = null
}

function onRowDrop(e: DragEvent) {
  if (!dragColumn) return
  e.preventDefault()
  const id = dragColumn
  const beforeId = columnBefore(e.clientX)
  onDragEnd()
  const from = columns.value.findIndex((c) => c.id === id)
  if (from < 0 || (columns.value[from + 1]?.id ?? null) === beforeId) return
  const [column] = columns.value.splice(from, 1)
  const at = beforeId ? columns.value.findIndex((c) => c.id === beforeId) : -1
  if (at >= 0) columns.value.splice(at, 0, column!)
  else columns.value.push(column!)
  changed()
}

function columnClass(column: KanbanColumn, i: number) {
  const d = columnDrop.value
  const from = columns.value.findIndex((c) => c.id === draggedColumnId.value)
  const same = !!d && from >= 0 && (columns.value[from + 1]?.id ?? null) === d.beforeId
  return {
    'is-dragged': draggedColumnId.value === column.id,
    'is-target': cardDrop.value?.columnId === column.id,
    'drop-before': !!d && !same && d.beforeId === column.id,
    'drop-after': !!d && !same && d.beforeId === null && i === columns.value.length - 1,
  }
}

// On the whole page: files let go next to a column must not be opened by the browser instead.
function onPageDragOver(e: DragEvent) {
  if (!hasFiles(e) || e.defaultPrevented) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
}

function onPageDrop(e: DragEvent) {
  if (hasFiles(e)) e.preventDefault()
}

function onPageDragLeave(e: DragEvent) {
  // Out of the window.
  if (!e.relatedTarget) cardDrop.value = null
}

/** The mouse wheel over the row of columns scrolls it sideways (a list of cards that can scroll scrolls itself). */
function onRowWheel(e: WheelEvent) {
  const el = row.value
  if (!el || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return
  const list = (e.target as HTMLElement | null)?.closest<HTMLElement>('.kanban-cards')
  if (list && list.scrollHeight > list.clientHeight) return
  el.scrollLeft += e.deltaY
  e.preventDefault()
}

// ---- Ctrl+V: the column under the mouse (or the one with the selected card, or the first) ----
let pointerColumnId: string | null = null

function onColumnPointerEnter(column: KanbanColumn) {
  pointerColumnId = column.id
}

function onColumnPointerLeave(column: KanbanColumn) {
  if (pointerColumnId === column.id) pointerColumnId = null
}

function pasteColumn(): KanbanColumn | undefined {
  const selected = selectedIds.value[0]
  return columnById(pointerColumnId) ?? (selected ? findCard(selected)?.column : undefined) ?? columns.value[0]
}

function onPaste(e: ClipboardEvent) {
  if (!loaded.value || pickerOpen.value || linkOpen.value || isTypingIn(e.target)) return
  const column = pasteColumn()
  const pasted = column ? pastedForBoard(e) : null
  if (!column || !pasted) return
  e.preventDefault()
  if ('files' in pasted) addFiles(pasted.files, { columnId: column.id, beforeId: null })
  else if ('url' in pasted) addLink(pasted.url, '', column)
  else addText(column, pasted.text)
}

// ---- Keys ----
let pointerInBoard = false

function onPointerDown(e: PointerEvent) {
  pointerInBoard = !!area.value?.contains(e.target as Node)
}

function onKeyDown(e: KeyboardEvent) {
  if (pickerOpen.value || linkOpen.value || e.defaultPrevented || isTypingIn(e.target)) return
  const key = e.key.toLowerCase()
  const mod = e.ctrlKey || e.metaKey
  if (mod && key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && pointerInBoard && selectedIds.value.length) {
    e.preventDefault()
    removeSelected()
  } else if (e.key === 'Escape') {
    if (selectedIds.value.length) selectedIds.value = []
    else readingId.value = null
  }
}

// ---- Leaving: save first ----
useSaveBeforeLeaving({
  saveNow,
  unsaved: () => !allSaved() || !!editingId.value || !!renamingColumnId.value,
  uploading: () => uploads.uploading.value,
})

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('paste', onPaste)
  window.addEventListener('pointerdown', onPointerDown, true)
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('pointerdown', onPointerDown, true)
  if (lookTimer) clearTimeout(lookTimer)
})
</script>

<template>
  <div class="flex flex-col h-screen bg-black overflow-hidden" @dragover="onPageDragOver" @drop="onPageDrop" @dragleave="onPageDragLeave">
    <BoardHeader
      ref="header"
      view="kanban"
      :group-id="groupId"
      :name="name"
      :loaded="loaded"
      :failed="!!loadError"
      :save-state="saveState"
      :save-text="saveText"
      :upload-text="uploadText"
      @renamed="name = $event"
      @error="tell($event, { error: true })"
      @note="openPicker()"
      @text="addText()"
      @link="openLinkDialog()"
      @file="pickFiles()"
      @files="onFilesPicked"
    />

    <div v-if="loadError" class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <div class="text-[#444] text-sm">
        {{ loadError === 'gone' ? 'This group does not exist any more, or it is not yours.' : 'Could not load the board. Check your connection and try again.' }}
      </div>
      <NuxtLink to="/" class="text-[#6366f1] text-sm hover:underline">Go back to notes</NuxtLink>
    </div>

    <div v-else class="flex flex-1 min-h-0">
      <div ref="area" class="relative flex-1 min-w-0 flex flex-col" @click="onAreaClick">
        <!-- Undo, and what is selected -->
        <div class="relative flex items-center gap-1 h-12 px-4 shrink-0">
          <button class="btn btn-ghost btn-sm !px-1.5" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">
            <Undo2Icon :size="14" />
          </button>
          <button class="btn btn-ghost btn-sm !px-1.5" :disabled="!canRedo" title="Redo (Ctrl+Y)" @click="redo">
            <Redo2Icon :size="14" />
          </button>
          <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20" data-keep-selection>
            <SelectionBar
              :cards="selectedCards"
              :lines="[]"
              @color="setColor"
              @topic="toggleTopic"
              @write="writeSelected"
              @read="readingId = $event"
              @open-link="openUrl"
              @open-file="openFile"
              @download-file="downloadFile"
              @remove="removeSelected"
            >
              <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
              <button class="btn btn-ghost btn-sm !px-1.5" :disabled="!canMove(-1)" :title="moveTitle(-1)" @click="moveSelected(-1)">
                <ArrowLeftIcon :size="14" />
              </button>
              <button class="btn btn-ghost btn-sm !px-1.5" :disabled="!canMove(1)" :title="moveTitle(1)" @click="moveSelected(1)">
                <ArrowRightIcon :size="14" />
              </button>
            </SelectionBar>
            <p v-if="loaded && !selectedCards.length" class="hidden lg:block text-2xs text-[#3a3a3a] whitespace-nowrap select-none">
              Drag cards from column to column · Drag a column by its name to move it · Click a card to select it
            </p>
          </div>
        </div>

        <!-- The columns -->
        <div
          ref="row"
          class="kanban-row flex-1 min-h-0 flex items-stretch gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4"
          @dragover="onRowDragOver"
          @dragleave="onRowDragLeave"
          @drop="onRowDrop"
          @wheel="onRowWheel"
        >
          <p v-if="!loaded" class="m-auto text-sm text-[#444]">Loading…</p>
          <section
            v-for="(column, i) in columns"
            :key="column.id"
            class="kanban-column"
            :class="columnClass(column, i)"
            :style="{ borderTopColor: COLORS[column.color ?? 'gray'].line }"
            :data-column-id="column.id"
            :aria-label="`Column ${column.name}`"
            @dragover="onColumnDragOver($event, column)"
            @dragleave="onColumnDragLeave($event, column)"
            @drop="onColumnDrop($event, column)"
            @pointerenter="onColumnPointerEnter(column)"
            @pointerleave="onColumnPointerLeave(column)"
          >
            <KanbanColumnHead
              :column="column"
              :count="shownIn(column).length"
              :renaming="renamingColumnId === column.id"
              :can-move-left="i > 0"
              :can-move-right="i < columns.length - 1"
              :can-delete="columns.length > 1"
              @rename="renamingColumnId = column.id"
              @renamed="(n) => renameColumn(column.id, n)"
              @color="(c) => setColumnColor(column.id, c)"
              @move="(step) => moveColumn(column.id, i + step)"
              @remove="deleteColumn(column.id)"
              @dragstart="onColumnDragStart($event, column)"
              @dragend="onDragEnd"
            />

            <div class="kanban-cards flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 px-2 pt-2 pb-2">
              <KanbanCard
                v-for="card in shownIn(column)"
                :key="card.id"
                :card="card"
                :note="card.docId ? notes.get(card.docId) : undefined"
                :selected="selectedSet.has(card.id)"
                :editing="editingId === card.id"
                :dragged="draggedCardId === card.id"
                :class="{ 'drop-before': dropLineBefore(column, card), 'drop-after': dropLineAfter(column, card) }"
                @click="onCardClick($event, card)"
                @read="readingId = $event"
                @edit="editText(card.id)"
                @done="(text) => doneText(card.id, text)"
                @dragstart="onCardDragStart($event, card)"
                @dragend="onDragEnd"
              />
              <p v-if="!shownIn(column).length" class="kanban-empty" :class="{ 'is-target': cardDrop?.columnId === column.id }">
                No cards yet. Drag cards here, or add one below.
              </p>
            </div>

            <!-- Add to this column -->
            <div class="flex items-center gap-0.5 px-2 pt-1 pb-2 shrink-0">
              <button class="btn btn-ghost btn-sm flex-1 !justify-start" title="Add a text card to this column" @click="addText(column)">
                <PlusIcon :size="14" />
                Add text
              </button>
              <button class="btn btn-ghost btn-sm !px-1.5" title="Add a note to this column" @click="openPicker(column)">
                <FileTextIcon :size="14" />
              </button>
              <button class="btn btn-ghost btn-sm !px-1.5" title="Add a web page or a YouTube video to this column" @click="openLinkDialog(column)">
                <LinkIcon :size="14" />
              </button>
              <button class="btn btn-ghost btn-sm !px-1.5" title="Add pictures or files to this column (or drag them here)" @click="pickFiles(column)">
                <UploadIcon :size="14" />
              </button>
            </div>
          </section>

          <button
            v-if="loaded && columns.length < MAX_COLUMNS"
            class="kanban-add-column"
            title="Add a column (like Revise or Questions)"
            @click="addColumn"
          >
            <PlusIcon :size="15" />
            Add a column
          </button>
        </div>

        <NoticeBar :notice="notice" :can-undo="canUndo" @undo="undo" @close="notice = null" />
      </div>

      <NoteReader v-if="readingId" :doc-id="readingId" class="w-[440px] max-w-[45vw] shrink-0" @close="readingId = null" />
    </div>

    <NotePicker
      v-if="pickerOpen"
      :in-group="pickerIds"
      @pick="pickNote"
      @create="createNote"
      @close="pickerOpen = false"
    />
    <LinkDialog v-if="linkOpen" @add="(url, linkName) => addLink(url, linkName, targetColumn())" @close="linkOpen = false" />
  </div>
</template>

<style>
/* The Kanban, dark. (The cards' own look: ~/assets/board.css.) */
.kanban-column {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 288px;
  flex-shrink: 0;
  min-height: 0;
  border: 1px solid #1a1a1a;
  border-top-width: 3px;
  border-radius: 0;
  background: #070707;
  transition: background-color 0.12s, border-color 0.12s;
}

.kanban-column.is-target {
  border-left-color: rgba(99, 102, 241, 0.45);
  border-right-color: rgba(99, 102, 241, 0.45);
  border-bottom-color: rgba(99, 102, 241, 0.45);
  background: #0a0a14;
}

.kanban-column.is-dragged {
  opacity: 0.4;
}

/* Where a dragged column would go. */
.kanban-column.drop-before::before,
.kanban-column.drop-after::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: 2px;
  background: #6366f1;
  pointer-events: none;
}

.kanban-column.drop-before::before {
  left: -8.5px;
}

.kanban-column.drop-after::after {
  right: -8.5px;
}

.board-card.kanban-card {
  flex-shrink: 0;
  min-height: 0;
  padding: 10px 12px;
  cursor: grab;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.board-card.kanban-card.is-picture {
  padding: 6px;
}

.board-card.kanban-card.is-topic {
  padding: 14px 16px;
}

.board-card.kanban-card.is-selected {
  box-shadow: 0 0 0 2px #6366f1, 0 2px 8px rgba(0, 0, 0, 0.35);
}

.board-card.kanban-card.is-dragged {
  opacity: 0.35;
}

/* Where a dragged card (or files) would go. */
.board-card.kanban-card.drop-before::before,
.board-card.kanban-card.drop-after::after {
  content: '';
  position: absolute;
  left: 2px;
  right: 2px;
  height: 3px;
  border-radius: 2px;
  background: #6366f1;
  pointer-events: none;
}

.board-card.kanban-card.drop-before::before {
  top: -6.5px;
}

.board-card.kanban-card.drop-after::after {
  bottom: -6.5px;
}

.kanban-empty {
  padding: 18px 12px;
  border: 1px dashed #1f1f1f;
  border-radius: 0;
  color: #444;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  user-select: none;
}

.kanban-empty.is-target {
  border-color: rgba(99, 102, 241, 0.7);
  color: #818cf8;
}

.kanban-add-column {
  display: flex;
  align-self: flex-start;
  width: 288px;
  height: 44px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed #1f1f1f;
  border-radius: 0;
  color: #555;
  font-size: 13px;
  transition: color 0.12s, border-color 0.12s;
}

.kanban-add-column:hover {
  border-color: #333;
  color: #ccc;
}
</style>
