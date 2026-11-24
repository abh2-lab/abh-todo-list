// The MCP connection (Model Context Protocol): AI apps like Claude Code read and change the
// user's notes and groups here, with a personal key the user made in the app ("AI connections",
// app/components/AiConnectionsDialog.vue). What they can do is in server/mcp/tools.ts.
//
// This is MCP's "Streamable HTTP" way: the AI app sends JSON-RPC messages with POST and gets
// the answer back as JSON. We keep no sessions and never send messages first, so GET (a stream
// of messages from us) and DELETE (end a session) are not used.
// Every request carries the key: "Authorization: Bearer nk_…".

import { aiCallAllowed, aiCaller, type AiCaller } from '../utils/aiKeys'
import { hideQueryValues } from '../utils/dbErrors'
import { INSTRUCTIONS, TOOLS, callTool, hasTool } from '../mcp/tools'

/** The MCP versions we speak, newest first. An AI app that asks for another one gets the newest. */
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const MAX_BYTES = 10 * 1024 * 1024
const MAX_BATCH = 50

type Id = string | number

interface RpcResponse {
  jsonrpc: '2.0'
  id: Id | null
  result?: unknown
  error?: { code: number; message: string }
}

// JSON-RPC error codes
const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603
// Not a JSON-RPC code: used here for a missing key, a wrong key, and too many calls.
const NOT_ALLOWED = -32001

const ok = (id: Id, result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result })
const fail = (id: Id | null, code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } })

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (event.method !== 'POST') {
    setResponseHeader(event, 'Allow', 'POST')
    setResponseStatus(event, 405)
    return fail(null, INVALID_REQUEST, 'Send MCP messages with POST. This connection never sends messages on its own.')
  }

  // A web page on another site can't use this from someone's browser (MCP asks servers to check this).
  const origin = getRequestHeader(event, 'origin')
  if (origin && !fromThisHost(origin, getRequestHost(event, { xForwardedHost: true }))) {
    setResponseStatus(event, 403)
    return fail(null, NOT_ALLOWED, 'AI apps connect here from outside a browser.')
  }

  const length = Number.parseInt(getRequestHeader(event, 'content-length') || '')
  if (length > MAX_BYTES) {
    setResponseStatus(event, 413)
    return fail(null, INVALID_REQUEST, 'Too big: a message can be at most 10 MB.')
  }

  try {
    const caller = await aiCaller(event)
    if (!caller) {
      const sentKey = /^Bearer\s/i.test(getRequestHeader(event, 'authorization') ?? '')
      setResponseHeader(event, 'WWW-Authenticate', sentKey ? 'Bearer realm="notes", error="invalid_token"' : 'Bearer realm="notes"')
      setResponseStatus(event, 401)
      return fail(null, NOT_ALLOWED, sentKey
        ? 'This key is wrong, or it was deleted. Make a new key in the notes app: click your name, then "AI connections".'
        : 'A key is needed: send the header "Authorization: Bearer <your key>". Make a key in the notes app: click your name, then "AI connections".')
    }
    if (!aiCallAllowed(caller.keyId)) {
      setResponseHeader(event, 'Retry-After', 60)
      setResponseStatus(event, 429)
      return fail(null, NOT_ALLOWED, 'Too many calls with this key in the last minute. Wait a minute, then try again.')
    }

    const raw = (await readRawBody(event, 'utf8')) ?? ''
    if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
      setResponseStatus(event, 413)
      return fail(null, INVALID_REQUEST, 'Too big: a message can be at most 10 MB.')
    }
    let message: unknown
    try {
      message = JSON.parse(raw)
    } catch {
      setResponseStatus(event, 400)
      return fail(null, PARSE_ERROR, 'The message is not JSON.')
    }

    const messages = Array.isArray(message) ? message : [message]
    if (messages.length === 0 || messages.length > MAX_BATCH) {
      setResponseStatus(event, 400)
      return fail(null, INVALID_REQUEST, `Send 1 to ${MAX_BATCH} messages at a time.`)
    }
    // After "initialize", the AI app says which MCP version it uses on every request.
    const version = getRequestHeader(event, 'mcp-protocol-version')?.trim()
    const initializing = messages.some((m) => isObject(m) && m.method === 'initialize')
    if (version && !initializing && !VERSIONS.includes(version)) {
      setResponseStatus(event, 400)
      return fail(null, INVALID_REQUEST, `This server speaks MCP ${VERSIONS.join(', ')}, not ${version}.`)
    }

    // One after the other, so changes happen in the order they were sent.
    const answers: RpcResponse[] = []
    for (const m of messages) {
      const answer = await handle(m, caller)
      if (answer) answers.push(answer)
    }
    // Only notifications (like "initialized") or answers to us: nothing to send back.
    if (answers.length === 0) return sendNoContent(event, 202)
    if (!Array.isArray(message)) {
      const answer = answers[0]!
      if (answer.error?.code === INVALID_REQUEST) setResponseStatus(event, 400)
      return answer
    }
    return answers
  } catch (e) {
    console.error('[mcp] a request failed:', hideQueryValues(e))
    setResponseStatus(event, 500)
    return fail(null, INTERNAL_ERROR, 'Something went wrong on the server. Try again in a moment.')
  }
})

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** The Origin header names this same site. */
function fromThisHost(origin: string, host: string): boolean {
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase()
  } catch {
    return false // like "null"
  }
}

/** The answer to one JSON-RPC message, or null when it needs none. */
async function handle(m: unknown, caller: AiCaller): Promise<RpcResponse | null> {
  if (!isObject(m)) return fail(null, INVALID_REQUEST, 'A message must be a JSON-RPC object.')
  const id = typeof m.id === 'string' || typeof m.id === 'number' ? m.id : null
  if (typeof m.method !== 'string') {
    // An answer to a question from us. We never ask any, so there is nothing to do.
    if ('result' in m || 'error' in m) return null
    return fail(id, INVALID_REQUEST, 'A message needs a method.')
  }
  // A notification (no id), like "notifications/initialized": nothing to answer.
  if (id === null) return null
  const params = isObject(m.params) ? m.params : {}

  switch (m.method) {
    case 'initialize': {
      const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
      return ok(id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'notes', title: 'Notes', version: '1.0.0' },
        instructions: INSTRUCTIONS,
      })
    }
    case 'ping':
      return ok(id, {})
    case 'tools/list':
      return ok(id, { tools: TOOLS })
    case 'tools/call': {
      if (!hasTool(params.name)) return fail(id, INVALID_PARAMS, `There is no tool called ${JSON.stringify(String(params.name ?? ''))}.`)
      return ok(id, await callTool(params.name, params.arguments, caller))
    }
    default:
      return fail(id, METHOD_NOT_FOUND, `This server has no method ${JSON.stringify(m.method)}.`)
  }
}
