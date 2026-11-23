import { MAX_FILE_BYTES, MAX_FILE_MB } from '#shared/board'
import { UploadError, uploadBoardFile, type UploadedFile } from '~/lib/boardFiles'

// Pictures and files for a board, uploaded one after the other. Each one gets its card as soon
// as it is uploaded. `W` says where its card goes: a place on the Mind map, a column on the Kanban.
export function useBoardUploads<W>(opts: {
  groupId: string
  /** There is room for one more card (it says why not, when there is none). */
  hasRoom: () => boolean
  /** Put the card of an uploaded file on the board. */
  place: (file: UploadedFile, where: W | undefined) => void
  tell: TellFn
}) {
  /** Files waiting to be uploaded, and where their cards go. */
  const queue: { file: File; where?: W }[] = []
  /** How many files are being uploaded now, how many are done, and how much of this one is sent (0 to 1). */
  const count = ref(0)
  const done = ref(0)
  const part = ref(0)
  const uploading = computed(() => count.value > 0)
  const stop = new AbortController()
  let running = false

  /** "Uploading 2 of 5… 40%", or '' when nothing is being uploaded. */
  const uploadText = computed(() => {
    if (!uploading.value) return ''
    const percent = `${Math.round(part.value * 100)}%`
    return count.value > 1 ? `Uploading ${done.value + 1} of ${count.value}… ${percent}` : `Uploading… ${percent}`
  })

  /** Upload pictures and files, and put a card for each one on the board. */
  function addFiles(files: File[], where?: W) {
    if (!files.length || !opts.hasRoom()) return
    const big = files.filter((f) => f.size > MAX_FILE_BYTES)
    const ok = files.filter((f) => f.size > 0 && f.size <= MAX_FILE_BYTES)
    if (big.length === 1) opts.tell(`"${big[0]!.name}" is too big: a file can be at most ${MAX_FILE_MB} MB.`, { error: true })
    else if (big.length > 1) opts.tell(`${big.length} files are too big: a file can be at most ${MAX_FILE_MB} MB.`, { error: true })
    // A dropped folder looks like an empty file.
    else if (ok.length < files.length) opts.tell('Folders and empty files can\'t be put on the board. For the files in a folder, open it and pick them.', { error: true })
    for (const file of ok) queue.push({ file, where })
    count.value += ok.length
    void run()
  }

  async function run() {
    if (running) return
    running = true
    while (queue.length && !stop.signal.aborted && opts.hasRoom()) {
      const { file, where } = queue.shift()!
      part.value = 0
      try {
        opts.place(await uploadBoardFile(opts.groupId, file, (p) => (part.value = p), stop.signal), where)
      } catch (e) {
        if (e instanceof UploadError && e.status === -1) break
        const why = e instanceof Error ? e.message : 'The file could not be uploaded.'
        opts.tell(count.value > 1 ? `${file.name}: ${why}` : why, { error: true })
      }
      done.value++
    }
    queue.length = 0
    count.value = 0
    done.value = 0
    part.value = 0
    running = false
  }

  onBeforeUnmount(() => stop.abort())

  return { uploading, uploadText, addFiles }
}
