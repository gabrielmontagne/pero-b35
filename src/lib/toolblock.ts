import { Session } from './scan'

export type IncludeToolMode = 'none' | 'call' | 'result'
export type ToolsPlacement = 'top' | 'bottom'

export type ToolCallEntry = {
  name: string
  params: Record<string, string>
  result?: string
}

export function extractLastToolPhase(session: Session): ToolCallEntry[] {
  // Find final assistant message with content (no tool_calls)
  let finalAssistantIndex = -1
  for (let i = session.length - 1; i >= 0; i--) {
    const m = session[i] as any
    if (m.role === 'assistant' && !m.tool_calls) {
      finalAssistantIndex = i
      break
    }
  }
  if (finalAssistantIndex === -1) return []

  // Find the nearest previous assistant with tool_calls
  let toolsAssistantIndex = -1
  let toolCalls: any[] | undefined
  for (let i = finalAssistantIndex - 1; i >= 0; i--) {
    const m = session[i] as any
    if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length) {
      toolsAssistantIndex = i
      toolCalls = m.tool_calls
      break
    }
  }
  if (toolsAssistantIndex === -1 || !toolCalls) return []

  // Build a map of tool_call_id -> tool message content between toolsAssistantIndex and finalAssistantIndex
  const toolResultsById = new Map<string, string>()
  for (let i = toolsAssistantIndex + 1; i < finalAssistantIndex; i++) {
    const m = session[i] as any
    if (m.role === 'tool' && m.tool_call_id) {
      toolResultsById.set(m.tool_call_id, String(m.content ?? ''))
    }
  }

  const entries: ToolCallEntry[] = []
  for (const call of toolCalls) {
    const name: string = call.function?.name ?? 'unknown_tool'
    let args: any
    try {
      args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}
    } catch (e) {
      args = { _raw_arguments: String(call.function?.arguments ?? '') }
    }
    const params: Record<string, string> = {}
    Object.keys(args || {}).forEach((k) => {
      const v = args[k]
      params[k] = typeof v === 'string' ? v : JSON.stringify(v)
    })

    const id: string | undefined = call.id
    const result = id ? toolResultsById.get(id) : undefined

    entries.push({ name, params, ...(result !== undefined ? { result } : {}) })
  }

  return entries
}

export function makeToolsBlock(
  entries: ToolCallEntry[],
  {
    mode,
    maxPerResultChars = 22000,
    maxTotalChars = 60000,
  }: {
    mode: IncludeToolMode
    maxPerResultChars?: number
    maxTotalChars?: number
  }
): string | undefined {
  if (mode === 'none' || !entries.length) return undefined

  // Prepare possibly truncated results
  const localEntries = entries.map((e) => ({ ...e }))
  if (mode === 'result') {
    for (const e of localEntries) {
      if (typeof e.result === 'string' && e.result.length > maxPerResultChars) {
        const total = e.result.length
        e.result =
          e.result.slice(0, maxPerResultChars) +
          `\n[truncated to ${maxPerResultChars} chars; total=${total}]`
      }
    }
  } else {
    // remove results if mode === 'call'
    for (const e of localEntries) delete e.result
  }

  const renderOnce = () => serializeYaml(localEntries, mode)
  let body = renderOnce()
  if (body.length > maxTotalChars) {
    if (mode === 'result') {
      // simple iterative shrink of per-result caps until it fits or reaches a floor
      let cap = maxPerResultChars
      let guard = 0
      while (body.length > maxTotalChars && cap > 200 && guard < 5) {
        cap = Math.max(200, Math.floor(cap * 0.7))
        for (const e of localEntries) {
          if (typeof e.result === 'string') {
            const rawLen = e.result.length
            if (rawLen > cap) {
              const total = rawLen
              e.result =
                e.result.slice(0, cap) +
                `\n[truncated to ${cap} chars; total=${total}]`
            }
          }
        }
        body = renderOnce()
        guard++
      }
    }
    // If still too big, hard trim body (keeps YAML but may cut mid-line)
    if (body.length > maxTotalChars) {
      body =
        body.slice(0, maxTotalChars - 64) +
        `\n[tools block truncated to ${maxTotalChars} chars]\n`
    }
  }

  return `@@.tools\n${body}@@\n`
}

function serializeYaml(
  entries: ToolCallEntry[],
  mode: IncludeToolMode
): string {
  // Minimal YAML serialization tailored for our structure
  const lines: string[] = []
  for (const e of entries) {
    lines.push(`- ${e.name}:`)
    // params
    for (const k of Object.keys(e.params)) {
      const v = e.params[k]
      if (v.includes('\n')) {
        lines.push(`  ${k}: |`)
        v.split('\n').forEach((ln) => lines.push(`    ${ln}`))
      } else {
        // quote if contains colon or hash to keep YAML simple
        const needsQuote = /[:#]/.test(v)
        const val = needsQuote ? JSON.stringify(v) : v
        lines.push(`  ${k}: ${val}`)
      }
    }
    if (mode === 'result' && e.result !== undefined) {
      const r = e.result
      if (r.includes('\n')) {
        lines.push(`  result: |`)
        r.split('\n').forEach((ln) => lines.push(`    ${ln}`))
      } else {
        const needsQuote = /[:#]/.test(r)
        const val = needsQuote ? JSON.stringify(r) : r
        lines.push(`  result: ${val}`)
      }
    }
  }
  return lines.join('\n') + '\n'
}

export function insertToolsBlock(
  assistantText: string,
  toolsBlock: string | undefined,
  reasoning: string | undefined,
  includeReasoning: boolean,
  placement: ToolsPlacement
): string {
  const thinkBlock =
    includeReasoning && reasoning ? `\n@@.think\n${reasoning}\n@@\n\n` : ''

  if (!toolsBlock) {
    // preserve current behavior
    return includeReasoning && reasoning
      ? `\n${thinkBlock}${assistantText}`
      : assistantText
  }

  if (placement === 'top') {
    return `${toolsBlock}\n${thinkBlock}${assistantText}`
  } else {
    return `${assistantText}${thinkBlock}\n${toolsBlock}`
  }
}
