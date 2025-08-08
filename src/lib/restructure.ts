import { ChatCompletionRole } from 'openai/resources'
import { OperatorFunction, combineLatest, map, switchMap } from 'rxjs'
import { createInputTextFiles$ } from './io'
import { flog, logToFile } from './log'
import { Session } from './scan'
import { interpolate } from './interpolate'
import {
  extractLastToolPhase,
  makeToolsBlock,
  insertToolsBlock,
  IncludeToolMode,
  ToolsPlacement,
} from './toolblock'

const startMarker = /^__START__\s*\n/m
const endMarker = /^__END__\s*\n/m

const roleToHeader: Record<ChatCompletionRole, string> = {
  system: 'S',
  user: 'Q',
  assistant: 'A',
  tool: 'T',
  function: 'F',
}

const visibleRoles = new Set<ChatCompletionRole>([
  'user',
  'assistant',
  'system',
])
const impliedInitialRole = new Set<ChatCompletionRole>(['system', 'user'])

export async function parse(
  text: string,
  gatewayConfig?: { audioFormat?: string }
) {
  const { result, firstKey } = pair(text)
  result[0].key = firstKey == 'Q' ? 'S' : 'Q'
  const session: Session = []

  for (const next of result) {
    if (!next.content) continue
    if (next.key == 'S') {
      session.push({ role: 'system' as const, content: next.content })
    } else if (next.key == 'Q') {
      session.push({
        role: 'user' as const,
        content: await interpolate(next.content, gatewayConfig),
      })
    } else if (next.key == 'A') {
      session.push({ role: 'assistant' as const, content: next.content })
    }
  }
  return session
}

export function includePreamble(
  preamble: string[]
): OperatorFunction<string, string> {
  return (source$) =>
    combineLatest({
      preamble: createInputTextFiles$(preamble),
      main: source$,
    }).pipe(
      flog(`Include preamble ${preamble.join(',')}`),
      map(({ preamble, main }) => `${preamble}\n\n${main}`)
    )
}

export function rebuildLeadingTrailing(
  leading: string | undefined,
  trailing: string | undefined
): OperatorFunction<string, string> {
  return (source$) =>
    source$.pipe(
      map(
        (content) =>
          `${
            leading ? `${leading}\n__START__\n\n` : ''
          }${content}${trailing ? `\n__END__\n\n${trailing}` : ''}`
      )
    )
}

export function startEndSplit(text: string): {
  leading?: string
  main: string
  trailing?: string
} {
  const leadingChunks = text.split(startMarker)
  const tail = leadingChunks.pop()
  const trailingChunks = tail?.split(endMarker)
  const main = trailingChunks?.shift() || text

  return {
    main,
    ...(leadingChunks.length && { leading: leadingChunks.join('__START__\n') }),
    ...(trailingChunks?.length && {
      trailing: trailingChunks.join('__END__\n'),
    }),
  }
}

export function parseSession(gatewayConfig?: {
  audioFormat?: string
}): OperatorFunction<string, Session> {
  return (source$) =>
    source$.pipe(
      switchMap((text) => parse(text, gatewayConfig)),
      flog('Parse')
    )
}

export function recombineWithOriginal({
  original,
  outputOnly = false,
  includeReasoning = false,
  includeTool = 'none',
  toolsPlacement = 'top',
}: {
  original: string
  outputOnly: boolean
  includeReasoning: boolean
  includeTool?: IncludeToolMode
  toolsPlacement?: ToolsPlacement
}): OperatorFunction<Session, string> {
  return map((session) => {
    const m: any = session[session.length - 1]
    if (!m) return ''

    const assistantText = `${m?.content || '×'}`
    const reasoning =
      'reasoning' in m
        ? m.reasoning
        : 'reasoning_content' in m
          ? m.reasoning_content
          : ''

    if (reasoning) {
      logToFile(`[REASONING: ${reasoning}]`)
    }

    const entries = extractLastToolPhase(session)
    const toolsBlock = makeToolsBlock(entries, { mode: includeTool })
    const combined = insertToolsBlock(
      assistantText,
      toolsBlock,
      reasoning,
      includeReasoning,
      toolsPlacement
    )

    if (outputOnly) return combined
    return `${original}\nA>>\n\n${combined}\n\nQ>>\n\n`
  })
}

export function recombineSession(): OperatorFunction<Session, string> {
  return map((session) => {
    const result = session.reduceRight((acc, message, i) => {
      const { role, content } = message
      if (!visibleRoles.has(role)) {
        return acc
      }
      if (role === 'assistant' && message.tool_calls) {
        return acc
      }
      const shouldShowHeader = i != 0 || !impliedInitialRole.has(role)
      return `${shouldShowHeader ? roleToHeader[role] + '>>\n\n' : ''}${content}\n\n${acc}`
    }, '')
    return result
  })
}

function pair(t: string) {
  const result: Partial<{ key: string; content: string }>[] = []

  return t.split(/^(\w)>>/m).reduceRight(
    (acc, next, i) => {
      const { result, firstKey: lastFirstKey } = acc
      const isKey = i % 2 == 1
      const clean = next.trim()

      let firstKey = lastFirstKey
      if (!isKey) {
        const index = i / 2
        result[index] = { content: clean }
      } else {
        const index = i / 2 + 0.5
        firstKey = clean
        result[index].key = clean
      }
      return { result, firstKey }
    },
    { result, firstKey: '' }
  )
}
