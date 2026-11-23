<script setup lang="ts">
import { ConnectionMode, VueFlow, useVueFlow, type GraphEdge, type GraphNode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'
import '~/assets/board.css'
import { MaximizeIcon, MinusIcon, NetworkIcon, PlusIcon, Redo2Icon, Undo2Icon, UploadIcon } from '@lucide/vue'
import {
  MAX_CARDS,
  MAX_FILE_NAME,
  MAX_LABEL,
  MAX_LINES,
  isBoardImage,
  newBoardId,
  type BoardCard,
  type BoardColor,
  type BoardData,
  type BoardLine,
  type CardContent,
  type Side,
} from '#shared/board'
import { youtubeSrc } from '#shared/noteContent'
import {
  BOARD_CONTEXT,
  CARD_WIDTH,
  COLORS,
  cardToNode,
  edgeToLine,
  isTypingIn,
  lineMarker,
  lineToEdge,
  nodeToCard,
  notesOffText,
  pastedForBoard,
  placesForNew,
  youtubeId,
} from '~/lib/board'
import { downloadBoardFile, openBoardFile, type UploadedFile } from '~/lib/boardFiles'
import type { DocMeta } from '~/types/docs'
import type { FullGroup } from '~/types/groups'
import BoardHeader from './BoardHeader.vue'
import BoardLineEdge from './BoardLine.vue'
import FileCard from './FileCard.vue'
import ImageCard from './ImageCard.vue'
import LinkCard from './LinkCard.vue'
import LinkDialog from './LinkDialog.vue'
import NoteCard from './NoteCard.vue'
import NotePicker from './NotePicker.vue'
import NoteReader from './NoteReader.vue'
import NoticeBar from './NoticeBar.vue'
import SelectionBar from './SelectionBar.vue'
import TextCard from './TextCard.vue'
import VideoCard from './VideoCard.vue'

// The Mind map of a group: its notes as cards, text cards, and lines between them. (The
// group's other board is the Kanban: KanbanView.vue.)
// It saves by itself a moment after each change. Ctrl+Z / Ctrl+Y undo and redo.
//
// The notes in the group decide which note cards there are: a note put in the group from the
// notes list gets a card here, and taking a note card off the board takes the note out of the
// group (the note itself stays). Cards of notes in the Trash are kept, hidden, until the note
// is back.
const props = defineProps<{ groupId: string }>()

const MIN_ZOOM = 0.1
const MAX_ZOOM = 2.5
/** About the height of a text card with one line, for placing a new one. */
const TEXT_CARD_HEIGHT = 46

const flowId = `board-${props.groupId}`
const {
  addEdges,
  addNodes,
  addSelectedEdges,
  findEdge,
  findNode,
  fitView,
  getEdges,
  getNodes,
  getSelectedEdges,
  getSelectedNodes,
  getViewport,
  onConnect,
  onConnectEnd,
  onConnectStart,
  onEdgeDoubleClick,
  onMoveEnd,
  onNodeDragStop,
  onNodesInitialized,
  onSelectionDragStop,
  removeEdges,
  removeNodes,
  removeSelectedElements,
  setEdges,
  setNodes,
  setViewport,
  updateEdgeData,
  updateNode,
  updateNodeData,
  viewport,
  zoomIn,
  zoomOut,
} = useVueFlow(flowId)

const header = ref<InstanceType<typeof BoardHeader> | null>(null)
const canvas = ref<HTMLElement | null>(null)
const name = ref('')
const loaded = ref(false)
const loadError = ref<'gone' | 'failed' | null>(null)
const { notice, tell } = useBoardNotice()
const { notes, members, setNotes, inTrash, syncMembers, addNote, newNote } = useBoardNotes(props.groupId, tell)
/** Cards of notes in the Trash, and their lines: not shown, but saved with the board. */
let hiddenCards: BoardCard[] = []
let hiddenLines: BoardLine[] = []
/** The board's save number on the server. */
let version = 0

const editingId = ref<string | null>(null)
const editingLineId = ref<string | null>(null)
const readingId = ref<string | null>(null)
const pickerOpen = ref(false)
const pickerIds = ref<string[]>([])
const linkOpen = ref(false)
const connecting = ref(false)

usePageTitle(() => name.value || 'Board')

// ---- The board as data ----

function currentBoard(): BoardData {
  return {
    cards: [...getNodes.value.map((n) => nodeToCard(n as GraphNode<BoardCard>)), ...hiddenCards],
    lines: [...getEdges.value.map((e) => edgeToLine(e as GraphEdge<BoardLine>)), ...hiddenLines],
  }
}

/** Put a board on the screen (when it is loaded, and for undo and redo). */
function showBoard(board: BoardData) {
  const hidden = new Set(board.cards.filter((c) => inTrash(c.docId)).map((c) => c.id))
  hiddenCards = board.cards.filter((c) => hidden.has(c.id))
  hiddenLines = board.lines.filter((l) => hidden.has(l.from) || hidden.has(l.to))
  editingId.value = null
  editingLineId.value = null
  setNodes(board.cards.filter((c) => !hidden.has(c.id)).map(cardToNode))
  setEdges(board.lines.filter((l) => !hidden.has(l.from) && !hidden.has(l.to)).map(lineToEdge))
}

// ---- Saving, and undo and redo ----
const { saveState, saveText, markUnsaved, saveNow, allSaved } = useBoardSaving({
  send: async () => {
    const saved = await $fetch<{ version: number }>(`/api/groups/${encodeURIComponent(props.groupId)}`, {
      method: 'PUT',
      body: { board: currentBoard(), version },
    })
    version = saved.version
  },
  onConflict: async () => {
    tell('This board was changed in another tab or window, so it was loaded again.', { error: true })
    await load()
  },
})

const history = useBoardHistory<BoardData>({ current: currentBoard, show: showBoard, onChange: markUnsaved })
const { canUndo, canRedo } = history
/** Call after each change: it can be undone, and it is saved soon. */
const changed = history.changed

/** Keep the group's notes the same as the note cards on the board (after taking cards off, undo and redo). */
function syncNoteCards() {
  return syncMembers(() => history.latest().cards.flatMap((c) => (c.kind === 'note' && c.docId ? [c.docId] : [])))
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
  version = g.version
  setNotes(g.notes)

  // Cards of notes taken out of the group (from the notes list or the Kanban) go away, and notes
  // put in the group there get a card, below the others.
  const cards = g.board.cards.filter((c) => c.kind !== 'note' || (c.docId && members.has(c.docId)))
  const ids = new Set(cards.map((c) => c.id))
  const lines = g.board.lines.filter((l) => ids.has(l.from) && ids.has(l.to))
  const onBoard = new Set(cards.map((c) => c.docId))
  const missing = g.notes.filter((n) => !n.inTrash && !onBoard.has(n.id))
  const places = placesForNew(missing.length, cards)
  missing.forEach((n, i) => {
    const p = places[i]!
    cards.push({ id: newBoardId(), kind: 'note', docId: n.id, x: p.x, y: p.y })
  })

  const board: BoardData = { cards, lines }
  showBoard(board)
  history.reset()
  loaded.value = true
  if (JSON.stringify(board) !== JSON.stringify(g.board)) markUnsaved()
  await nextTick()
  // An empty board has no cards to measure (see onNodesInitialized).
  if (!getNodes.value.length) placeView()
}

// ---- Where you look: kept for next time ----
const VIEW_KEY = `board-view:${props.groupId}`
let viewPlaced = false

function placeView() {
  if (viewPlaced) return
  viewPlaced = true
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null') as { x: number; y: number; zoom: number } | null
    if (saved && [saved.x, saved.y, saved.zoom].every(Number.isFinite)) {
      void setViewport({ x: saved.x, y: saved.y, zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, saved.zoom)) })
      return
    }
  } catch {
    // No saved place (or no storage): look at the whole board.
  }
  if (getNodes.value.length) void fitView({ padding: 0.2, maxZoom: 1 })
  else {
    const r = canvas.value?.getBoundingClientRect()
    void setViewport({ x: (r?.width ?? 800) / 2, y: (r?.height ?? 600) / 3, zoom: 1 })
  }
}

onNodesInitialized(() => placeView())
onMoveEnd(({ flowTransform }) => {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(flowTransform))
  } catch {
    // Storage full or blocked: the board opens on all its cards next time.
  }
})

function fitAll() {
  void fitView({ padding: 0.2, maxZoom: 1.2, duration: 200 })
}

// ---- Places on the board ----

/** A place on the screen (like a mouse click) as a place on the board. */
function toBoard(clientX: number, clientY: number) {
  const r = canvas.value?.getBoundingClientRect()
  const { x, y, zoom } = getViewport()
  return { x: (clientX - (r?.left ?? 0) - x) / zoom, y: (clientY - (r?.top ?? 0) - y) / zoom }
}

function viewCenter() {
  const r = canvas.value?.getBoundingClientRect()
  return toBoard((r?.left ?? 0) + (r?.width ?? 800) / 2, (r?.top ?? 0) + (r?.height ?? 600) / 2)
}

/** A place for a new card of about w × h: p, or the nearest place around it that is not on another card. */
function freePlace(p: { x: number; y: number }, w: number, h: number) {
  const gap = 16
  const boxes = getNodes.value.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.dimensions.width || 200,
    h: n.dimensions.height || 80,
  }))
  const fits = (x: number, y: number) =>
    boxes.every((b) => x + w + gap <= b.x || b.x + b.w + gap <= x || y + h + gap <= b.y || b.y + b.h + gap <= y)
  const round = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) })
  if (fits(p.x, p.y)) return round(p.x, p.y)
  const ways = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]] as const
  for (let ring = 1; ring <= 40; ring++) {
    for (const [dx, dy] of ways) {
      const x = p.x + dx * ring * 40
      const y = p.y + dy * ring * 40
      if (fits(x, y)) return round(x, y)
    }
  }
  return round(p.x, p.y)
}

function centerOf(n: GraphNode) {
  return { x: n.position.x + n.dimensions.width / 2, y: n.position.y + n.dimensions.height / 2 }
}

/** The side of a card that faces a place. */
function sideFacing(n: GraphNode, p: { x: number; y: number }): Side {
  const c = centerOf(n)
  const dx = (p.x - c.x) / (n.dimensions.width / 2 || 1)
  const dy = (p.y - c.y) / (n.dimensions.height / 2 || 1)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'bottom' : 'top'
}

function roomForCard() {
  if (getNodes.value.length + hiddenCards.length < MAX_CARDS) return true
  tell(`A board can have at most ${MAX_CARDS} cards.`, { error: true })
  return false
}

// ---- Text cards ----

/**
 * A new text card, at a place on the board (or near the middle of the screen).
 * Without words, it is ready to write in.
 */
function addText(at?: { x: number; y: number }, text = '') {
  if (!loaded.value || !roomForCard()) return
  const c = at ?? viewCenter()
  const box = { x: c.x - CARD_WIDTH.text / 2, y: c.y - TEXT_CARD_HEIGHT / 2 }
  // A double-click puts the card right there; the others find an empty place near it.
  const p = at && !text ? { x: Math.round(box.x), y: Math.round(box.y) } : freePlace(box, CARD_WIDTH.text, TEXT_CARD_HEIGHT)
  const card: BoardCard = { id: newBoardId(), kind: 'text', x: p.x, y: p.y, text }
  addNodes([cardToNode(card)])
  // An empty one is not a change yet: it goes away when you stop writing.
  if (text) changed()
  else editingId.value = card.id
}

function editText(id: string) {
  editingLineId.value = null
  editingId.value = id
}

function doneText(id: string, text: string | null) {
  if (editingId.value === id) editingId.value = null
  const node = findNode<BoardCard>(id)
  if (!node) return
  const before = node.data.text ?? ''
  const now = text ?? before
  if (node.data.kind === 'text' && !now.trim()) {
    // An empty text card is not kept.
    removeNodes([id], true)
    changed()
    if (before.trim()) tell('The empty card was deleted.', { undo: true })
    return
  }
  // Link, video, picture and file cards: their name (none = the address or file name shows).
  if (text !== null) updateNodeData<BoardCard>(id, { text: text || undefined })
  changed()
}

// ---- Links and videos ----

/** A card for a web address: a video card for a YouTube video, a link card for the rest. */
function addLink(url: string, linkName = '', at?: { x: number; y: number }) {
  linkOpen.value = false
  if (!loaded.value || !roomForCard()) return
  const isVideo = !!youtubeSrc(url) && !!youtubeId(url)
  const kind = isVideo ? 'video' : 'link'
  const w = CARD_WIDTH[kind]
  const h = isVideo ? 240 : 90
  const c = at ?? viewCenter()
  const p = freePlace({ x: c.x - w / 2, y: c.y - h / 2 }, w, h)
  const card: BoardCard = { id: newBoardId(), kind, x: p.x, y: p.y, url }
  if (linkName) card.text = linkName.slice(0, MAX_LABEL)
  addNodes([cardToNode(card)])
  changed()
}

/** Where the mouse was on the board last (for Ctrl+V), or null when it was not on the board. */
let lastPointer: { x: number; y: number } | null = null

function onCanvasPointerMove(e: PointerEvent) {
  lastPointer = { x: e.clientX, y: e.clientY }
}

function onCanvasPointerLeave() {
  lastPointer = null
}

/**
 * Ctrl+V on the board: a link becomes a link (or video) card, other words a text card,
 * and a picture (like a screenshot) or a copied file is uploaded.
 */
function onPaste(e: ClipboardEvent) {
  if (!loaded.value || pickerOpen.value || linkOpen.value || isTypingIn(e.target)) return
  const pasted = pastedForBoard(e)
  if (!pasted) return
  e.preventDefault()
  const at = lastPointer ? toBoard(lastPointer.x, lastPointer.y) : undefined
  if ('files' in pasted) addFiles(pasted.files, at)
  else if ('url' in pasted) addLink(pasted.url, '', at)
  else addText(at, pasted.text)
}

// ---- Pictures and files ----
const uploads = useBoardUploads<{ x: number; y: number }>({ groupId: props.groupId, hasRoom: roomForCard, place: addFileCard, tell })
const { uploading, uploadText } = uploads

/** Upload pictures and files, and put a card for each one on the board (near `at`, or the middle). */
function addFiles(files: File[], at?: { x: number; y: number }) {
  if (loaded.value) uploads.addFiles(files, at)
}

/** The card for an uploaded file: a picture card for pictures, a file card for the rest. */
function addFileCard(f: UploadedFile, at?: { x: number; y: number }) {
  const kind = isBoardImage(f.type) ? 'image' : 'file'
  const w = CARD_WIDTH[kind]
  const h = kind === 'image' ? 200 : 90
  const c = at ?? viewCenter()
  const p = freePlace({ x: c.x - w / 2, y: c.y - h / 2 }, w, h)
  const card: BoardCard = {
    id: newBoardId(),
    kind,
    x: p.x,
    y: p.y,
    fileId: f.id,
    fileName: f.name.slice(0, MAX_FILE_NAME),
    fileType: f.type,
    fileSize: f.size,
  }
  addNodes([cardToNode(card)])
  changed()
}

function openFile(card: CardContent) {
  if (card.fileId) openBoardFile(card.fileId)
}

function downloadFile(card: CardContent) {
  if (card.fileId) downloadBoardFile(card.fileId, card.fileName)
}

// Files dragged from the computer onto the board.
const dropping = ref(false)

function hasFiles(e: DragEvent) {
  return !!e.dataTransfer?.types.includes('Files')
}

function onDragEnter(e: DragEvent) {
  if (!hasFiles(e) || !loaded.value) return
  e.preventDefault()
  dropping.value = true
}

/** (On the whole page: a file dropped next to the board must not be opened by the browser instead.) */
function onDragOver(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = dropping.value ? 'copy' : 'none'
}

function onDrop(e: DragEvent) {
  if (!hasFiles(e)) return
  e.preventDefault()
  if (!dropping.value) return
  dropping.value = false
  addFiles([...(e.dataTransfer?.files ?? [])], toBoard(e.clientX, e.clientY))
}

/** Double-click on an empty place: a text card there. */
function onCanvasDblClick(e: MouseEvent) {
  const t = e.target as HTMLElement | null
  if (!t?.closest('.vue-flow__pane') || t.closest('.vue-flow__node, .vue-flow__edge, .vue-flow__minimap, .board-line-label')) return
  addText(toBoard(e.clientX, e.clientY))
}

// ---- Lines ----

function addLine(from: string, to: string, fromSide?: Side | null, toSide?: Side | null, isChange = true) {
  if (from === to) return
  // These two cards are already joined this way.
  if (getEdges.value.some((e) => e.source === from && e.target === to)) return
  if (getEdges.value.length + hiddenLines.length >= MAX_LINES) {
    tell(`A board can have at most ${MAX_LINES} lines.`, { error: true })
    return
  }
  const line: BoardLine = { id: newBoardId(), from, to }
  if (fromSide) line.fromSide = fromSide
  if (toSide) line.toSide = toSide
  addEdges([lineToEdge(line)])
  if (isChange) changed()
}

let lineStart: { nodeId: string; side: Side | null } | null = null
let lineMade = false

onConnectStart(({ nodeId, handleId }) => {
  lineStart = nodeId ? { nodeId, side: (handleId as Side | null) ?? null } : null
  lineMade = false
  connecting.value = true
})

// Let go on a dot of another card.
onConnect((c) => {
  lineMade = true
  addLine(c.source, c.target, c.sourceHandle as Side | null, c.targetHandle as Side | null)
})

// Let go somewhere else: on a card (the line goes to its nearest side), or on an empty place
// (a new text card there, joined to the first one: the quick way to grow a mind map).
onConnectEnd((e) => {
  connecting.value = false
  const start = lineStart
  lineStart = null
  if (lineMade || !start || !e) return
  const point = 'changedTouches' in e ? e.changedTouches[0] : e
  if (!point) return
  const el = document.elementFromPoint(point.clientX, point.clientY)
  if (!el || el.closest('.vue-flow__minimap')) return
  const source = findNode(start.nodeId)
  if (!source) return

  const cardEl = el.closest<HTMLElement>('.vue-flow__node')
  if (cardEl) {
    const target = findNode(cardEl.dataset.id)
    if (target && target.id !== source.id) addLine(source.id, target.id, start.side, sideFacing(target, centerOf(source)))
    return
  }
  if (!el.closest('.vue-flow__pane') || !roomForCard()) return

  const p = toBoard(point.clientX, point.clientY)
  const c = centerOf(source)
  const dx = c.x - p.x
  const dy = c.y - p.y
  const side: Side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top'
  const w = CARD_WIDTH.text
  const h = TEXT_CARD_HEIGHT
  const x = side === 'left' ? p.x : side === 'right' ? p.x - w : p.x - w / 2
  const y = side === 'top' ? p.y : side === 'bottom' ? p.y - h : p.y - h / 2
  const card: BoardCard = { id: newBoardId(), kind: 'text', x: Math.round(x), y: Math.round(y), text: '' }
  addNodes([cardToNode(card)])
  // One change when the words are written (and nothing, if the card stays empty).
  addLine(source.id, card.id, start.side, side, false)
  editingId.value = card.id
})

function editLabel(id: string) {
  editingId.value = null
  editingLineId.value = id
}

function doneLabel(id: string, label: string | null) {
  if (editingLineId.value === id) editingLineId.value = null
  if (label === null || !findEdge(id)) return
  updateEdgeData<BoardLine>(id, { label: label || undefined })
  changed()
}

function selectLine(id: string) {
  const edge = findEdge(id)
  if (!edge) return
  removeSelectedElements()
  addSelectedEdges([edge])
}

onEdgeDoubleClick(({ edge }) => editLabel(edge.id))

// ---- Moving and resizing ----
onNodeDragStop(() => changed())
onSelectionDragStop(() => changed())

function resized(id: string, size: { w: number; h?: number }) {
  if (!findNode(id)) return
  const w = Math.round(size.w)
  const h = size.h ? Math.round(size.h) : undefined
  updateNodeData<BoardCard>(id, { w, h })
  // The resizer fixes the height too; cards that are only made wider grow with their text again.
  updateNode(id, { style: h ? { width: `${w}px`, height: `${h}px` } : { width: `${w}px` } })
  changed()
}

// ---- What is selected (the bar at the top) ----
const selectedCards = computed(() => getSelectedNodes.value.map((n) => nodeToCard(n as GraphNode<BoardCard>)))
const selectedLines = computed(() => getSelectedEdges.value.map((e) => edgeToLine(e as GraphEdge<BoardLine>)))

function setLineLook(edge: GraphEdge, look: Partial<BoardLine>) {
  updateEdgeData<BoardLine>(edge.id, look)
  edge.markerEnd = lineMarker({ ...(edge.data as BoardLine), ...look })
}

function setColor(color: BoardColor) {
  const value = color === 'gray' ? undefined : color
  for (const n of getSelectedNodes.value) updateNodeData<BoardCard>(n.id, { color: value })
  for (const e of getSelectedEdges.value) setLineLook(e, { color: value })
  changed()
}

function toggleTopic() {
  const n = getSelectedNodes.value[0]
  if (n?.data?.kind !== 'text') return
  updateNodeData<BoardCard>(n.id, { style: n.data.style === 'topic' ? undefined : 'topic' })
  changed()
}

function toggleArrow() {
  const e = getSelectedEdges.value[0]
  if (!e) return
  setLineLook(e, { arrow: e.data?.arrow === false ? undefined : false })
  changed()
}

function toggleDashed() {
  const e = getSelectedEdges.value[0]
  if (!e) return
  setLineLook(e, { dashed: e.data?.dashed ? undefined : true })
  changed()
}

/** Text card: write in it. Link, video, picture and file cards: give them a name. */
function writeSelected() {
  const n = getSelectedNodes.value[0]
  if (n && n.data?.kind !== 'note') editText(n.id)
}

function labelSelected() {
  const e = getSelectedEdges.value[0]
  if (e) editLabel(e.id)
}

function openLink(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

function removeSelected() {
  const nodes = getSelectedNodes.value
  const edges = getSelectedEdges.value
  if (!nodes.length && !edges.length) return
  const notesOff = nodes.filter((n) => n.data?.kind === 'note').length
  removeEdges(edges.map((e) => e.id))
  removeNodes(nodes.map((n) => n.id), true)
  changed()
  void syncNoteCards()
  if (notesOff) tell(notesOffText(notesOff), { undo: true })
  else tell('Deleted.', { undo: true })
}

// ---- Adding notes ----

function openPicker() {
  pickerIds.value = [...members]
  pickerOpen.value = true
}

async function pickNote(doc: DocMeta) {
  pickerOpen.value = false
  if (members.has(doc.id) || !roomForCard()) return
  if (!(await addNote(doc))) return
  const c = viewCenter()
  const p = freePlace({ x: c.x - CARD_WIDTH.note / 2, y: c.y - 70 }, CARD_WIDTH.note, 140)
  addNodes([cardToNode({ id: newBoardId(), kind: 'note', docId: doc.id, x: p.x, y: p.y })])
  changed()
}

async function createNote(title: string) {
  pickerOpen.value = false
  const doc = await newNote(title)
  if (doc) await pickNote(doc)
}

// ---- Keys ----
let pointerInCanvas = false

function onPointerDown(e: PointerEvent) {
  pointerInCanvas = !!canvas.value?.contains(e.target as Node)
}

function onKeyDown(e: KeyboardEvent) {
  if (pickerOpen.value || linkOpen.value || e.defaultPrevented || isTypingIn(e.target)) return
  const key = e.key.toLowerCase()
  const mod = e.ctrlKey || e.metaKey
  const anySelected = getSelectedNodes.value.length > 0 || getSelectedEdges.value.length > 0
  if (mod && key === 'z' && !e.shiftKey) {
    e.preventDefault()
    undo()
  } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
    e.preventDefault()
    redo()
  } else if ((e.key === 'Delete' || e.key === 'Backspace') && pointerInCanvas && anySelected) {
    e.preventDefault()
    removeSelected()
  } else if (e.key === 'Escape') {
    if (anySelected) removeSelectedElements()
    else readingId.value = null
  }
}

// ---- Leaving: save first ----
useSaveBeforeLeaving({
  saveNow,
  unsaved: () => !allSaved() || !!editingId.value || !!editingLineId.value,
  uploading: () => uploading.value,
})

provide(BOARD_CONTEXT, {
  notes,
  editingId,
  editingLineId,
  read: (docId) => {
    readingId.value = docId
  },
  editText,
  doneText,
  editLabel,
  doneLabel,
  selectLine,
  resized,
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
})

function miniMapColor(n: GraphNode) {
  const color = (n.data as BoardCard | undefined)?.color
  return color ? COLORS[color].line : '#3f3f46'
}

const zoomText = computed(() => `${Math.round(viewport.value.zoom * 100)}%`)
const isEmpty = computed(() => loaded.value && getNodes.value.length === 0)
</script>

<template>
  <div class="flex flex-col h-screen bg-black overflow-hidden" @dragover="onDragOver" @drop="onDrop">
    <BoardHeader
      ref="header"
      view="map"
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
      @link="linkOpen = true"
      @file="header?.pickFiles()"
      @files="addFiles($event)"
    />

    <div v-if="loadError" class="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <div class="text-[#444] text-sm">
        {{ loadError === 'gone' ? 'This group does not exist any more, or it is not yours.' : 'Could not load the board. Check your connection and try again.' }}
      </div>
      <NuxtLink to="/" class="text-[#6366f1] text-sm hover:underline">Go back to notes</NuxtLink>
    </div>

    <div v-else class="flex flex-1 min-h-0">
      <div
        ref="canvas"
        class="board-canvas relative flex-1 min-w-0"
        :class="{ 'is-connecting': connecting }"
        @dblclick="onCanvasDblClick"
        @pointermove="onCanvasPointerMove"
        @pointerleave="onCanvasPointerLeave"
        @dragenter="onDragEnter"
      >
        <VueFlow
          :id="flowId"
          :connection-mode="ConnectionMode.Loose"
          :connection-radius="28"
          :connection-line-options="{ style: { stroke: '#818cf8', strokeWidth: 2 } }"
          :delete-key-code="null"
          :zoom-on-double-click="false"
          :disable-keyboard-a11y="true"
          :min-zoom="MIN_ZOOM"
          :max-zoom="MAX_ZOOM"
          :elevate-edges-on-select="true"
        >
          <template #node-note="p">
            <NoteCard v-bind="p" />
          </template>
          <template #node-text="p">
            <TextCard v-bind="p" />
          </template>
          <template #node-link="p">
            <LinkCard v-bind="p" />
          </template>
          <template #node-video="p">
            <VideoCard v-bind="p" />
          </template>
          <template #node-image="p">
            <ImageCard v-bind="p" />
          </template>
          <template #node-file="p">
            <FileCard v-bind="p" />
          </template>
          <template #edge-board="p">
            <BoardLineEdge v-bind="p" />
          </template>

          <Background :gap="24" :size="1.2" pattern-color="#262626" />
          <MiniMap
            pannable
            zoomable
            class="board-minimap"
            :node-color="miniMapColor"
            :node-border-radius="8"
            mask-color="rgba(0, 0, 0, 0.6)"
            :width="180"
            :height="120"
          />
        </VueFlow>

        <!-- What is selected -->
        <div class="absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <SelectionBar
            :cards="selectedCards"
            :lines="selectedLines"
            @color="setColor"
            @topic="toggleTopic"
            @write="writeSelected"
            @label="labelSelected"
            @arrow="toggleArrow"
            @dashed="toggleDashed"
            @read="readingId = $event"
            @open-link="openLink"
            @open-file="openFile"
            @download-file="downloadFile"
            @remove="removeSelected"
          />
        </div>

        <!-- Files dragged over the board -->
        <div
          v-if="dropping"
          class="absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-[#6366f1]/70 bg-[#6366f1]/10"
          @dragleave="dropping = false"
        >
          <div class="pointer-events-none flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b] text-sm text-[#ddd] shadow-2xl shadow-black">
            <UploadIcon :size="16" class="text-[#818cf8]" />
            Let go to put them on the board
          </div>
        </div>

        <!-- Empty board -->
        <div v-if="isEmpty" class="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <div class="max-w-sm text-center">
            <NetworkIcon :size="28" class="mx-auto mb-3 text-[#2a2a2a]" />
            <p class="text-sm text-[#888]">This board is empty.</p>
            <p class="mt-1 text-xs leading-relaxed text-[#555]">
              Add notes, text, links and files with the buttons at the top. You can also double-click
              anywhere to write, drag files here from your computer, or paste a link or a picture (Ctrl+V).
              Then drag a dot on a card's side to another card to join them with a line.
            </p>
          </div>
        </div>

        <!-- Zoom and undo -->
        <div class="absolute bottom-4 left-4 z-10 flex items-center gap-1 px-1 py-1 rounded-lg border border-[#1f1f1f] bg-[#0b0b0b]/95">
          <button class="btn btn-ghost btn-sm !px-1.5" title="Zoom out" @click="zoomOut({ duration: 150 })">
            <MinusIcon :size="14" />
          </button>
          <span class="w-11 text-center text-2xs text-[#777] tabular-nums select-none">{{ zoomText }}</span>
          <button class="btn btn-ghost btn-sm !px-1.5" title="Zoom in" @click="zoomIn({ duration: 150 })">
            <PlusIcon :size="14" />
          </button>
          <button class="btn btn-ghost btn-sm !px-1.5" title="See the whole board" @click="fitAll">
            <MaximizeIcon :size="14" />
          </button>
          <div class="w-px h-5 bg-[#1f1f1f] mx-0.5" />
          <button class="btn btn-ghost btn-sm !px-1.5" :disabled="!canUndo" title="Undo (Ctrl+Z)" @click="undo">
            <Undo2Icon :size="14" />
          </button>
          <button class="btn btn-ghost btn-sm !px-1.5" :disabled="!canRedo" title="Redo (Ctrl+Y)" @click="redo">
            <Redo2Icon :size="14" />
          </button>
        </div>

        <!-- How to use it -->
        <p class="absolute bottom-5 left-1/2 -translate-x-1/2 z-[5] hidden xl:block text-2xs text-[#3a3a3a] select-none pointer-events-none whitespace-nowrap">
          Drag a card's dot to draw a line · Double-click a line to write on it · Shift+drag to select many
        </p>

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
    <LinkDialog v-if="linkOpen" @add="(url, linkName) => addLink(url, linkName)" @close="linkOpen = false" />
  </div>
</template>

<style>
/* The board (Vue Flow), dark. Not scoped: Vue Flow makes these parts itself. */
.board-canvas .vue-flow__node:focus,
.board-canvas .vue-flow__node:focus-visible,
.board-canvas .vue-flow__edge:focus {
  outline: none;
}

/* (The cards themselves: ~/assets/board.css.) */

/* The dots on the sides: shown when you point at a card, or while drawing a line. */
.board-handle {
  width: 12px;
  height: 12px;
  min-width: 0;
  min-height: 0;
  border: 2px solid #000;
  border-radius: 9999px;
  background: #6366f1;
  opacity: 0;
  transition: opacity 0.12s;
}

.board-handle::after {
  content: '';
  position: absolute;
  inset: -7px;
  border-radius: 9999px;
}

.board-canvas .vue-flow__node:hover .board-handle,
.board-canvas .vue-flow__node.selected .board-handle,
.board-canvas.is-connecting .board-handle {
  opacity: 1;
}

.board-canvas .board-handle.connecting,
.board-canvas .board-handle:hover {
  background: #a5b4fc;
}

/* The edge to drag, to make a card wider. */
.board-canvas .vue-flow__resize-control.line.board-resize {
  width: 10px;
  border-color: transparent;
  border-right-width: 2px;
}

.board-canvas .vue-flow__node:hover .board-resize:hover,
.board-canvas .vue-flow__node.selected .board-resize {
  border-color: #6366f1;
}

.board-line-label {
  position: absolute;
  max-width: 240px;
  padding: 2px 9px;
  overflow: hidden;
  border: 1px solid #5b5b66;
  border-radius: 9999px;
  background: #0b0b0b;
  color: #ccc;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  text-overflow: ellipsis;
  pointer-events: all;
  cursor: pointer;
}

.board-line-label.is-selected {
  color: #fff;
}

.board-canvas .vue-flow__connection-path {
  stroke: #818cf8;
  stroke-width: 2;
}

.board-canvas .vue-flow__selection {
  border: 1px solid rgba(99, 102, 241, 0.7);
  background: rgba(99, 102, 241, 0.08);
}

.board-canvas .vue-flow__nodesselection-rect {
  border: 1px dashed rgba(99, 102, 241, 0.6);
  background: rgba(99, 102, 241, 0.04);
}

.board-canvas .vue-flow__minimap {
  overflow: hidden;
  border: 1px solid #1f1f1f;
  border-radius: 8px;
  background: #0b0b0b;
}
</style>
