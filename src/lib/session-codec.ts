import { randomUUID } from 'crypto'
import { Session } from './scan'
import { makeToolsBlock, ToolCallEntry } from './toolblock'

const ZERO_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
  },
}

export type PiFileEntry = {
  type: string
  id?: string
  parentId?: string | null
  timestamp?: string
  version?: number
  cwd?: string
  message?: any
  summary?: string
  firstKeptEntryId?: string
  content?: any
  [key: string]: any
}

function shortId(used: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const id = randomUUID().slice(0, 8)
    if (!used.has(id)) {
      used.add(id)
      return id
    }
  }
  const id = randomUUID()
  used.add(id)
  return id
}

function extractThinkingBlocks(text: string): {
  text: string
  thinking: string
} {
  const thinkingParts: string[] = []
  const thinkRegex = /@@\.think\n([\s\S]*?)\n@@/g
  let match
  while ((match = thinkRegex.exec(text)) !== null) {
    thinkingParts.push(match[1])
  }
  const cleanText = text.replace(/@@\.think\n[\s\S]*?\n@@\s*/g, '').trim()
  return { text: cleanText, thinking: thinkingParts.join('\n\n') }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    if (part.type === 'text' && typeof part.text === 'string') {
      parts.push(part.text)
    } else if (part.type === 'image' || part.type === 'image_url') {
      const mime = typeof part.mimeType === 'string' ? part.mimeType : ''
      parts.push(`[image omitted${mime ? `: ${mime}` : ''}]`)
    }
  }
  return parts.filter(Boolean).join('\n')
}

function paramsOf(args: unknown): Record<string, string> {
  if (typeof args === 'string') {
    try {
      return paramsOf(JSON.parse(args))
    } catch {
      return { _raw: args }
    }
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {}
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    params[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  return params
}

export function sessionToEntries(
  session: Session,
  options: { cwd?: string; model?: string } = {}
): PiFileEntry[] {
  const used = new Set<string>()
  const cwd = options.cwd || process.cwd()
  const model = options.model || 'unknown'
  const header: PiFileEntry = {
    type: 'session',
    version: 3,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    cwd,
  }
  const entries: PiFileEntry[] = [header]
  let parentId: string | null = null

  session.forEach((message, index) => {
    if (message.role !== 'user' && message.role !== 'assistant') return

    const id = shortId(used)
    const timestamp = new Date(Date.now() + index).toISOString()
    const messageTimestamp = Date.parse(timestamp)

    if (message.role === 'user') {
      entries.push({
        type: 'message',
        id,
        parentId,
        timestamp,
        message: {
          role: 'user',
          content:
            typeof message.content === 'string'
              ? message.content
              : textOf(message.content),
          timestamp: messageTimestamp,
        },
      })
    } else {
      const raw =
        typeof message.content === 'string'
          ? message.content
          : textOf(message.content)
      const extracted = extractThinkingBlocks(raw)
      const fieldReasoning =
        (message as any).reasoning || (message as any).reasoning_content || ''
      const thinking = extracted.thinking || fieldReasoning
      const content: Array<Record<string, string>> = []
      if (thinking) content.push({ type: 'thinking', thinking })
      if (extracted.text) content.push({ type: 'text', text: extracted.text })

      entries.push({
        type: 'message',
        id,
        parentId,
        timestamp,
        message: {
          role: 'assistant',
          content,
          api: 'openai-completions',
          provider: 'pero',
          model,
          usage: ZERO_USAGE,
          stopReason: 'stop',
          timestamp: messageTimestamp,
        },
      })
    }

    parentId = id
  })

  return entries
}

export function parseJsonl(jsonlText: string): PiFileEntry[] {
  const entries: PiFileEntry[] = []
  for (const line of jsonlText.split('\n')) {
    if (!line.trim()) continue
    try {
      entries.push(JSON.parse(line))
    } catch {
      continue
    }
  }
  return entries
}

export function leafPath(entries: PiFileEntry[]): PiFileEntry[] {
  const tree = entries.filter((entry) => entry.type !== 'session' && entry.id)
  if (!tree.length) return []

  const byId = new Map(tree.map((entry) => [entry.id as string, entry]))
  const path: PiFileEntry[] = []
  const seen = new Set<string>()
  let current: PiFileEntry | undefined = tree[tree.length - 1]

  while (current && current.id && !seen.has(current.id)) {
    seen.add(current.id)
    path.push(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }

  path.reverse()
  return path
}

// Same rule as pi's buildContextEntries: latest compaction on the leaf path
// replaces everything before firstKeptEntryId. The summary stays.
export function contextPath(path: PiFileEntry[]): PiFileEntry[] {
  let compaction: PiFileEntry | undefined
  for (const entry of path) {
    if (entry.type === 'compaction') compaction = entry
  }
  if (!compaction) return path

  const compactionIdx = path.findIndex((entry) => entry.id === compaction!.id)
  if (compactionIdx < 0) return path

  const kept: PiFileEntry[] = [compaction]
  let foundFirstKept = false
  for (let i = 0; i < compactionIdx; i++) {
    const entry = path[i]
    if (entry.id === compaction.firstKeptEntryId) foundFirstKept = true
    if (
      foundFirstKept &&
      !(entry.type === 'message' && entry.message?.role === 'system')
    ) {
      kept.push(entry)
    }
  }
  kept.push(...path.slice(compactionIdx + 1))
  return kept
}

function toolsBlock(
  calls: any[],
  results: Map<string, { text: string; isError: boolean; name: string }>
): string | undefined {
  const entries: ToolCallEntry[] = calls.map((call) => {
    const result = call.id ? results.get(call.id) : undefined
    const resultText = result
      ? result.isError
        ? `[error]\n${result.text}`
        : result.text
      : undefined
    return {
      name: call.name || result?.name || 'tool',
      params: paramsOf(call.arguments),
      ...(resultText !== undefined ? { result: resultText } : {}),
    }
  })
  return makeToolsBlock(entries, { mode: 'result' })
}

export function entriesToSession(entries: PiFileEntry[]): Session {
  const path = contextPath(leafPath(entries))
  const results = new Map<
    string,
    { text: string; isError: boolean; name: string }
  >()

  for (const entry of path) {
    const message = entry.type === 'message' ? entry.message : undefined
    if (message?.role === 'toolResult' && message.toolCallId) {
      results.set(message.toolCallId, {
        name: message.toolName || 'tool',
        text: textOf(message.content),
        isError: !!message.isError,
      })
    }
  }

  const consumed = new Set<string>()
  const session: Session = []

  path.forEach((entry, index) => {
    if (entry.type === 'compaction') {
      if (index === 0 && entry.summary) {
        session.push({
          role: 'assistant',
          content: `%%% compaction\n${entry.summary}`,
        })
      }
      return
    }

    if (entry.type === 'branch_summary' && entry.summary) {
      session.push({
        role: 'assistant',
        content: `%%% branch summary\n${entry.summary}`,
      })
      return
    }

    if (entry.type === 'custom_message') {
      const text = textOf(entry.content)
      if (text) session.push({ role: 'user', content: text })
      return
    }

    if (entry.type !== 'message' || !entry.message) return
    const message = entry.message

    if (message.role === 'system') return

    if (message.role === 'bashExecution') {
      if (message.excludeFromContext) return
      const text = [`$ ${message.command || ''}`, message.output || '']
        .filter(Boolean)
        .join('\n')
      if (text) session.push({ role: 'user', content: text })
      return
    }

    if (message.role === 'toolResult') {
      if (message.toolCallId && consumed.has(message.toolCallId)) return
      const block = makeToolsBlock(
        [
          {
            name: message.toolName || 'tool',
            params: {},
            result: textOf(message.content),
          },
        ],
        { mode: 'result' }
      )
      if (block) session.push({ role: 'assistant', content: block })
      return
    }

    if (message.role === 'user') {
      const text = textOf(message.content)
      if (text) session.push({ role: 'user', content: text })
      return
    }

    if (message.role !== 'assistant') return

    const blocks = Array.isArray(message.content) ? message.content : []
    const thinking = blocks
      .filter((block: any) => block?.type === 'thinking' && block.thinking)
      .map((block: any) => block.thinking)
      .join('\n\n')
    const fromString =
      typeof message.content === 'string'
        ? extractThinkingBlocks(message.content)
        : undefined
    const text = fromString
      ? fromString.text
      : [
          blocks
            .filter((block: any) => block?.type === 'text')
            .map((block: any) => block.text || '')
            .join(''),
          ...blocks
            .filter((block: any) => block?.type === 'image')
            .map(
              (block: any) =>
                `[image omitted${block.mimeType ? `: ${block.mimeType}` : ''}]`
            ),
        ]
          .filter(Boolean)
          .join('\n')
    const calls = blocks.filter((block: any) => block?.type === 'toolCall')
    for (const call of calls) {
      if (call.id) consumed.add(call.id)
    }
    const block = calls.length ? toolsBlock(calls, results) : undefined
    const content = [block, text].filter(Boolean).join('\n')
    const folded: any = { role: 'assistant', content }
    const reasoning = thinking || fromString?.thinking
    if (reasoning) folded.reasoning = reasoning
    session.push(folded)
  })

  return session
}

export function sessionToJsonl(
  session: Session,
  options: { cwd?: string; model?: string } = {}
): string {
  return sessionToEntries(session, options)
    .map((entry) => JSON.stringify(entry))
    .join('\n')
    .concat('\n')
}

export function jsonlToSession(jsonlText: string): Session {
  return entriesToSession(parseJsonl(jsonlText))
}

export function renderFlat(session: Session): string {
  const chunks: string[] = []
  const visible = session.filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  )

  for (const message of visible) {
    const text =
      typeof message.content === 'string'
        ? message.content
        : textOf(message.content)
    if (message.role === 'user') {
      chunks.push(`Q>>\n\n${text}\n`)
      continue
    }
    const reasoning =
      (message as any).reasoning || (message as any).reasoning_content || ''
    const body = reasoning
      ? text
        ? `@@.think\n${reasoning}\n@@\n\n${text}`
        : `@@.think\n${reasoning}\n@@`
      : text
    chunks.push(`A>>\n\n${body}\n`)
  }

  if (!chunks.length) return ''
  if (visible[visible.length - 1].role === 'assistant') chunks.push('Q>>\n\n')
  return chunks.join('\n')
}

export function jsonlToFlat(jsonlText: string): string {
  return renderFlat(jsonlToSession(jsonlText))
}
