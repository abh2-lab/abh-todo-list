<script setup lang="ts">
import { ConnectionMode, VueFlow, useVueFlow, type GraphEdge, type GraphNode } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import '@vue-flow/node-resizer/dist/style.css'
import {
  ChevronLeftIcon,
  FileTextIcon,
  LinkIcon,
  MaximizeIcon,
  MinusIcon,
  NetworkIcon,
  PlusIcon,
  Redo2Icon,
  TypeIcon,
  Undo2Icon,
  UploadIcon,
  XIcon,
} from '@lucide/vue'
import {
  MAX_CARDS,
  MAX_FILE_BYTES,
  MAX_FILE_MB,
  MAX_FILE_NAME,
  MAX_LABEL,
  MAX_LINES,
  MAX_TEXT,
  cleanWebAddress,
  isBoardImage,
  newBoardId,
  type BoardCard,
  type BoardColor,
  type BoardData,
  type BoardLine,
  type Side,
} from '#shared/board'
import { youtubeSrc } from '#shared/noteContent'
import { notePreview } from '#shared/noteText'
import {
  BOARD_CONTEXT,
  CARD_WIDTH,
  COLORS,
  cardToNode,
  copyBoard,
  edgeToLine,
  lineMarker,
  lineToEdge,
  nodeToCard,
  placesForNew,
  youtubeId,
} from '~/lib/board'
import { UploadError, fileUrl, uploadBoardFile, type UploadedFile } from '~/lib/boardFiles'
import type { DocMeta, FullDoc } from '~/types/docs'
import type { FullGroup, GroupNote } from '~/types/groups'
import BoardLineEdge from './BoardLine.vue'
import FileCard from './FileCard.vue'
import ImageCard from './ImageCard.vue'
import LinkCard from './LinkCard.vue'
import LinkDialog from './LinkDialog.vue'
import NoteCard from './NoteCard.vue'
import NotePicker from './NotePicker.vue'
import NoteReader from './NoteReader.vue'
import SelectionBar from './SelectionBar.vue'
import TextCard from './TextCard.vue'
import VideoCard from './VideoCard.vue'

// The board of a group (a Mind map): its notes as cards, text cards, and lines between them.
// It saves by itself a moment after each change. Ctrl+Z / Ctrl+Y undo and redo.
//
// The notes in the group decide which note cards there are: a note put in the group from the
// notes list gets a card here, and taking a note card off the board takes the note out of the
// group (the note itself stays). Cards of notes in the Trash are kept, hidden, until the note
// is back.
const props = defineProps<{ groupId: string }>()

const MIN_ZOOM = 0.1
const MAX_ZOOM = 2.5
const MAX_UNDO = 100
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
const { setInGroup, renameGroup } = useGroups()

const canvas = ref<HTMLElement | null>(null)
const name = ref('')
const loaded = ref(false)
const loadError = ref<'gone' | 'failed' | null>(null)
/** The notes in the group (name, first words), by note id. */
const notes = ref(new Map<string, GroupNote>())
/** The notes in the group, as the server has them (with the ones in the Trash). */
const members = new Set<string>()
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

// ---- A short message at the bottom (with "Undo" after deleting) ----
const notice = ref<{ text: string; undo?: boolean; error?: boolean } | null>(null)
let noticeTimer: ReturnType<typeof setTimeout> | null = null
function tell(text: string, opts: { undo?: boolean; error?: boolean } = {}) {
  notice.value = { text, ...opts }
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => (notice.value = null), opts.error ? 10000 : 8000)
}

// ---- The board as data ----

function currentBoard(): BoardData {
  return {
    cards: [...getNodes.value.map((n) => nodeToCard(n as GraphNode<BoardCard>)), ...hiddenCards],
    lines: [...getEdges.value.map((e) => edgeToLine(e as GraphEdge<BoardLine>)), ...hiddenLines],
  }
}

/** Put a board on the screen (when it is loaded, and for undo and redo). */
function showBoard(board: BoardData) {
  const hidden = new Set(board.cards.filter((c) => c.docId && notes.value.get(c.docId)?.inTrash).map((c) => c.id))
  hiddenCards = board.cards.filter((c) => hidden.has(c.id))
  hiddenLines = board.lines.filter((l) => hidden.has(l.from) || hidden.has(l.to))
  editingId.value = null
  editingLineId.value = null
  setNodes(board.cards.filter((c) => !hidden.has(c.id)).map(cardToNode))
  setEdges(board.lines.filter((l) => !hidden.has(l.from) && !hidden.has(l.to)).map(lineToEdge))
}

// ---- Undo and redo: copies of the whole board ----
let lastState: BoardData = { cards: [], lines: [] }
let lastJson = ''
let undoStack: BoardData[] = []
let redoStack: BoardData[] = []
const canUndo = ref(false)
const canRedo = ref(false)

function setBase(board: BoardData) {
  lastJson = JSON.stringify(board)
  lastState = JSON.parse(lastJson) as BoardData
}

function historyChanged() {
  canUndo.value = undoStack.length > 0
  canRedo.value = redoStack.length > 0
}

/** Call after each change: it can be undone, and it is saved soon. */
function changed() {
  const now = currentBoard()
  const json = JSON.stringify(now)
  if (json === lastJson) return
  undoStack.push(lastState)
  if (undoStack.length > MAX_UNDO) undoStack.shift()
  redoStack = []
  setBase(now)
  historyChanged()
  markUnsaved()
}

function restore(board: BoardData) {
  showBoard(copyBoard(board))
  setBase(currentBoard())
  historyChanged()
  markUnsaved()
  void syncMembers()
}

function undo() {
  const before = undoStack.pop()
  if (!before) return
  redoStack.push(lastState)
  restore(before)
  notice.value = null
}

function redo() {
  const after = redoStack.pop()
  if (!after) return
  undoStack.push(lastState)
  restore(after)
}

/**
 * Keep the group's notes the same as the note cards on the board: after taking note cards off,
 * and after undo or redo. Notes in the Trash stay in the group.
 */
let syncing: Promise<void> = Promise.resolve()
function syncMembers() {
  syncing = syncing.then(async () => {
    const want = new Set<string>()
    for (const c of lastState.cards) if (c.kind === 'note' && c.docId) want.add(c.docId)
    for (const [id, n] of notes.value) if (n.inTrash && members.has(id)) want.add(id)
    for (const id of want) {
      if (members.has(id)) continue
      members.add(id)
      try {
        await setInGroup(props.groupId, id, true)
      } catch (e) {
        members.delete(id)
        tell(errorMessage(e) ?? 'Could not put a note back in the group. Check your connection.', { error: true })
      }
    }
    for (const id of [...members]) {
      if (want.has(id)) continue
      members.delete(id)
      try {
        await setInGroup(props.groupId, id, false)
      } catch {
        members.add(id)
        tell('Could not take a note out of the group. Check your connection.', { error: true })
      }
    }
  })
  return syncing
}

// ---- Saving ----
const saveState = ref<'saved' | 'waiting' | 'saving' | 'error'>('saved')
let changeNo = 0
let savedNo = 0
let saveTimer: ReturnType<typeof setTimeout> | null = null
let running: Promise<void> | null = null

function markUnsaved() {
  changeNo++
  saveState.value = 'waiting'
  queueSave(800)
}

function queueSave(ms: number) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void saveNow()
  }, ms)
}

/** Save now. true = everything is saved. */
async function saveNow(): Promise<boolean> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  while (running) await running
  if (changeNo === savedNo) return true
  running = sendBoard()
  await running
  running = null
  return changeNo === savedNo
}

async function sendBoard() {
  const no = changeNo
  saveState.value = 'saving'
  try {
    const saved = await $fetch<{ version: number }>(`/api/groups/${encodeURIComponent(props.groupId)}`, {
      method: 'PUT',
      body: { board: currentBoard(), version },
    })
    version = saved.version
    savedNo = no
    if (changeNo === savedNo) saveState.value = 'saved'
    else {
      saveState.value = 'waiting'
      queueSave(800)
    }
  } catch (e) {
    if (errorStatus(e) === 409) {
      // Saved somewhere else (another tab): show that board. What was not saved here is dropped.
      savedNo = changeNo
      saveState.value = 'saved'
      tell('This board was changed in another tab or window, so it was loaded again.', { error: true })
      await load()
      return
    }
    saveState.value = 'error'
    queueSave(5000)
  }
}

const saveText = computed(() => {
  if (saveState.value === 'error') return 'Not saved: trying again…'
  if (saveState.value === 'saved') return 'Saved'
  return 'Saving…'
})

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
  notes.value = new Map(g.notes.map((n) => [n.id, n]))
  members.clear()
  for (const n of g.notes) members.add(n.id)

  // Cards of notes taken out of the group (from the notes list) go away, and notes put in the
  // group from the notes list get a card, below the others.
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
  setBase(currentBoard())
  undoStack = []
  redoStack = []
  historyChanged()
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
function addLink(url: string, name = '', at?: { x: number; y: number }) {
  linkOpen.value = false
  if (!loaded.value || !roomForCard()) return
  const isVideo = !!youtubeSrc(url) && !!youtubeId(url)
  const kind = isVideo ? 'video' : 'link'
  const w = CARD_WIDTH[kind]
  const h = isVideo ? 240 : 90
  const c = at ?? viewCenter()
  const p = freePlace({ x: c.x - w / 2, y: c.y - h / 2 }, w, h)
  const card: BoardCard = { id: newBoardId(), kind, x: p.x, y: p.y, url }
  if (name) card.text = name.slice(0, MAX_LABEL)
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
  if (!loaded.value || pickerOpen.value || linkOpen.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest?.('.board-reader'))) return
  const at = lastPointer ? toBoard(lastPointer.x, lastPointer.y) : undefined
  const text = e.clipboardData?.getData('text/plain').trim() ?? ''
  // Words come first: programs like Word also copy a picture of the words.
  const files = text ? [] : [...(e.clipboardData?.files ?? [])]
  if (files.length) {
    e.preventDefault()
    addFiles(files, at)
    return
  }
  if (!text) return
  e.preventDefault()
  const url = /^(https?:\/\/|www\.)\S+$/i.test(text) ? cleanWebAddress(text) : null
  if (url) addLink(url, '', at)
  else addText(at, text.slice(0, MAX_TEXT))
}

// ---- Pictures and files ----

const fileInput = ref<HTMLInputElement | null>(null)
/** Files waiting to be uploaded (one after the other), and where their cards go. */
const uploadQueue: { file: File; at?: { x: number; y: number } }[] = []
/** How many files are being uploaded now, how many are done, and how much of this one is sent (0 to 1). */
const uploadCount = ref(0)
const uploadDone = ref(0)
const uploadPart = ref(0)
const uploading = computed(() => uploadCount.value > 0)
const uploadStop = new AbortController()
let uploadRunning = false

const uploadText = computed(() => {
  const percent = `${Math.round(uploadPart.value * 100)}%`
  return uploadCount.value > 1 ? `Uploading ${uploadDone.value + 1} of ${uploadCount.value}… ${percent}` : `Uploading… ${percent}`
})

function pickFiles() {
  fileInput.value?.click()
}

function onFilesPicked() {
  const input = fileInput.value
  if (!input) return
  const files = [...(input.files ?? [])]
  input.value = ''
  addFiles(files)
}

/** Upload pictures and files, and put a card for each one on the board (near `at`, or the middle). */
function addFiles(files: File[], at?: { x: number; y: number }) {
  if (!loaded.value || !files.length || !roomForCard()) return
  const big = files.filter((f) => f.size > MAX_FILE_BYTES)
  const ok = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES)
  if (big.length === 1) tell(`"${big[0]!.name}" is too big: a file can be at most ${MAX_FILE_MB} MB.`, { error: true })
  else if (big.length > 1) tell(`${big.length} files are too big: a file can be at most ${MAX_FILE_MB} MB.`, { error: true })
  // A dropped folder looks like an empty file.
  else if (ok.length < files.length) tell('Folders and empty files can\'t be put on the board. For the files in a folder, open it and pick them.', { error: true })
  for (const file of ok) uploadQueue.push({ file, at })
  uploadCount.value += ok.length
  void runUploads()
}

async function runUploads() {
  if (uploadRunning) return
  uploadRunning = true
  while (uploadQueue.length && !uploadStop.signal.aborted && roomForCard()) {
    const { file, at } = uploadQueue.shift()!
    uploadPart.value = 0
    try {
      addFileCard(await uploadBoardFile(props.groupId, file, (part) => (uploadPart.value = part), uploadStop.signal), at)
    } catch (e) {
      if (e instanceof UploadError && e.status === -1) break
      const why = e instanceof Error ? e.message : 'The file could not be uploaded.'
      tell(uploadCount.value > 1 ? `${file.name}: ${why}` : why, { error: true })
    }
    uploadDone.value++
  }
  uploadQueue.length = 0
  uploadCount.value = 0
  uploadDone.value = 0
  uploadPart.value = 0
  uploadRunning = false
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

function openFile(card: BoardCard) {
  if (card.fileId) window.open(fileUrl(card.fileId), '_blank', 'noopener,noreferrer')
}

/** Download without leaving the page (a link with "download", clicked). */
function downloadFile(card: BoardCard) {
  if (!card.fileId) return
  const a = document.createElement('a')
  a.href = fileUrl(card.fileId, true)
  a.download = card.fileName ?? ''
  a.click()
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
  void syncMembers()
  if (notesOff) tell(notesOff === 1 ? 'Taken off the board. The note is still in your notes list.' : 'Taken off the board. The notes are still in your notes list.', { undo: true })
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
  members.add(doc.id)
  try {
    await setInGroup(props.groupId, doc.id, true)
  } catch (e) {
    members.delete(doc.id)
    tell(errorMessage(e) ?? 'Could not add the note. Check your connection and try again.', { error: true })
    return
  }
  notes.value.set(doc.id, { id: doc.id, title: doc.title, updatedAt: doc.updatedAt, isPrivate: doc.isPrivate, inTrash: false, preview: '' })
  const c = viewCenter()
  const p = freePlace({ x: c.x - CARD_WIDTH.note / 2, y: c.y - 70 }, CARD_WIDTH.note, 140)
  addNodes([cardToNode({ id: newBoardId(), kind: 'note', docId: doc.id, x: p.x, y: p.y })])
  changed()
  // Its first words, for the card.
  try {
    const full = await $fetch<FullDoc>(`/api/documents/${encodeURIComponent(doc.id)}`)
    const note = notes.value.get(doc.id)
    if (note) note.preview = notePreview(full.content)
  } catch {
    // The card shows only the name.
  }
}

async function createNote(title: string) {
  pickerOpen.value = false
  let doc: DocMeta
  try {
    doc = await $fetch<DocMeta>('/api/documents', { method: 'POST', body: { private: true, title } })
  } catch (e) {
    tell(errorMessage(e) ?? 'Could not make the note. Check your connection and try again.', { error: true })
    return
  }
  await pickNote(doc)
}

// ---- The group's name ----
const renaming = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

function startRename() {
  nameDraft.value = name.value
  renaming.value = true
  nextTick(() => nameInput.value?.select())
}

async function finishRename() {
  if (!renaming.value) return
  renaming.value = false
  const next = nameDraft.value.trim().replace(/\s+/g, ' ')
  if (!next || next === name.value) return
  const before = name.value
  name.value = next
  try {
    name.value = await renameGroup(props.groupId, next)
  } catch (e) {
    name.value = before
    tell(errorMessage(e) ?? 'Could not rename the group. Check your connection.', { error: true })
  }
}

function onNameKey(e: KeyboardEvent) {
  if (e.key === 'Enter') nameInput.value?.blur()
  else if (e.key === 'Escape') {
    nameDraft.value = name.value
    nameInput.value?.blur()
  }
}

// ---- Keys ----
let pointerInCanvas = false

function onPointerDown(e: PointerEvent) {
  pointerInCanvas = !!canvas.value?.contains(e.target as Node)
}

function onKeyDown(e: KeyboardEvent) {
  if (pickerOpen.value || linkOpen.value || e.defaultPrevented) return
  const t = e.target as HTMLElement | null
  if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.closest?.('.board-reader'))) return
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
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (changeNo === savedNo && !editingId.value && !editingLineId.value && !uploading.value) return
  void saveNow()
  e.preventDefault()
  e.returnValue = ''
}

function onVisibility() {
  if (document.visibilityState === 'hidden') void saveNow()
}

async function beforeLeave() {
  if (uploading.value && !window.confirm('Some files are still uploading. Leave anyway? They will not be put on the board.')) return false
  // Writing in a card or on a line: keep what was written.
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  await nextTick()
  if (await saveNow()) return true
  return window.confirm('Your last changes to this board are not saved yet (no connection?). Leave anyway?')
}
onBeforeRouteLeave(beforeLeave)
onBeforeRouteUpdate(beforeLeave)

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
  window.addEventListener('beforeunload', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibility)
  void load()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('beforeunload', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibility)
  if (noticeTimer) clearTimeout(noticeTimer)
  if (saveTimer) clearTimeout(saveTimer)
  uploadStop.abort()
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
    <header class="flex items-center gap-3 px-4 h-12 border-b border-[#1f1f1f] bg-black shrink-0">
      <NuxtLink
        to="/"
        class="flex items-center gap-1 text-2xs text-[#555] hover:text-[#999] transition-colors shrink-0"
        title="Back to your notes"
      >
        <ChevronLeftIcon :size="14" />
        Notes
      </NuxtLink>
      <span class="text-[#1f1f1f] select-none">/</span>
      <NetworkIcon :size="15" class="text-[#6366f1] shrink-0" />
      <input
        v-if="renaming"
        ref="nameInput"
        v-model="nameDraft"
        maxlength="100"
        aria-label="Name of the group"
        class="w-64 bg-[#0d0d0d] border border-[#6366f1]/50 rounded px-2 py-1 text-sm text-[#f0f0f0] outline-none"
        @keydown="onNameKey"
        @blur="finishRename"
      >
      <button
        v-else
        class="min-w-0 truncate max-w-[40vw] text-sm font-medium text-[#ddd] hover:text-white"
        :title="loaded ? 'Rename the group' : undefined"
        :disabled="!loaded"
        @click="startRename"
      >
        {{ name || (loadError ? 'Board' : 'Loading…') }}
      </button>
      <span
        v-if="loaded"
        class="text-2xs shrink-0"
        :class="saveState === 'error' ? 'text-[#fca5a5]' : 'text-[#444]'"
        aria-live="polite"
      >
        {{ saveText }}
      </span>
      <span v-if="uploading" class="text-2xs text-[#818cf8] shrink-0 tabular-nums" aria-live="polite">{{ uploadText }}</span>
      <span class="hidden lg:inline text-2xs text-[#333] shrink-0 select-none">Only you can see this board</span>

      <div class="flex-1" />

      <button class="btn btn-sm" :disabled="!loaded" title="Add one of your notes, or a new note" @click="openPicker">
        <FileTextIcon :size="14" />
        Note
      </button>
      <button class="btn btn-sm" :disabled="!loaded" title="Add a text card (or double-click an empty place on the board)" @click="addText()">
        <TypeIcon :size="14" />
        Text
      </button>
      <button class="btn btn-sm" :disabled="!loaded" title="Add a web page or a YouTube video (or copy a link and press Ctrl+V on the board)" @click="linkOpen = true">
        <LinkIcon :size="14" />
        Link
      </button>
      <button
        class="btn btn-sm"
        :disabled="!loaded"
        title="Add pictures or files from your computer (or drag them onto the board, or paste a picture with Ctrl+V)"
        @click="pickFiles"
      >
        <UploadIcon :size="14" />
        File
      </button>
      <input ref="fileInput" type="file" multiple class="hidden" @change="onFilesPicked">
    </header>

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

        <!-- A short message -->
        <div
          v-if="notice"
          class="absolute bottom-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pl-4 pr-2 py-2 rounded-lg border shadow-2xl shadow-black text-sm"
          :class="notice.error ? 'border-[#7f1d1d] bg-[#1a0b0b] text-[#fca5a5]' : 'border-[#1f1f1f] bg-[#0b0b0b] text-[#ccc]'"
          role="status"
        >
          <span>{{ notice.text }}</span>
          <button v-if="notice.undo && canUndo" class="btn btn-sm" @click="undo">
            <Undo2Icon :size="14" />
            Undo
          </button>
          <button class="btn btn-ghost btn-sm !px-1.5" title="Close" @click="notice = null">
            <XIcon :size="14" />
          </button>
        </div>
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
    <LinkDialog v-if="linkOpen" @add="(url, name) => addLink(url, name)" @close="linkOpen = false" />
  </div>
</template>

<style>
/* The board (Vue Flow), dark. Not scoped: Vue Flow makes these parts itself. */
.board-canvas .vue-flow__node:focus,
.board-canvas .vue-flow__node:focus-visible,
.board-canvas .vue-flow__edge:focus {
  outline: none;
}

.board-card {
  position: relative;
  box-sizing: border-box;
  min-height: 100%;
  padding: 12px 14px;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  color: #ddd;
  font-size: 14px;
  line-height: 1.5;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}

.board-card.is-selected {
  box-shadow: 0 0 0 2px #6366f1, 0 6px 20px rgba(0, 0, 0, 0.45);
}

.board-card.is-picture {
  padding: 6px;
}

.board-card.is-topic {
  padding: 16px 18px;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
}

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
