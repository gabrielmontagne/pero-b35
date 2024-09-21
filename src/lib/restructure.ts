import { ChatCompletionRole } from "openai/resources";
import { OperatorFunction, combineLatest, map } from "rxjs";
import { flog } from "./log";
import { Session } from "./scan";
import { createInputTextFiles$ } from "./io";

const startMarker = /^__START__\s*\n/m
const endMarker = /^__END__\s*\n/m

const roleToHeader: Record<ChatCompletionRole, string> = {
  system: 'S',
  user: 'Q',
  assistant: 'A',
  tool: 'T',
  function: 'F'
}

const visibleRoles = new Set<ChatCompletionRole>(['user', 'assistant', 'system'])
const impliedInitialRole = new Set<ChatCompletionRole>(['system', 'user'])

export function parse(text: string): Session {

  const { result, firstKey } = pair(text)
  result[0].key = firstKey == 'Q' ? 'S' : 'Q'
  const session: Session = []

  return result.filter(r => r.content).reduce(
    (acc, next) => {
      if (!next.content) return acc
      if (next.key == 'S') {
        return [
          ...acc,
          { role: 'system' as const, content: next.content }
        ]

      } else if (next.key == 'Q') {
        return [
          ...acc,
          { role: 'user' as const, content: next.content }
        ]
      } else if (next.key == 'A') {
        return [
          ...acc,
          { role: 'assistant' as const, content: next.content }
        ]
      }
      return acc

    },
    session
  )


}

export function includePreamble(preamble: string[]): OperatorFunction<string, string> {
  return (source$) => combineLatest({
    preamble: createInputTextFiles$(preamble),
    main: source$
  }).pipe(
    flog(`Include preamble ${preamble.join(',')}`),
    map(
      ({ preamble, main }) => `${preamble}\n\n${main}`
    )
  )
}

export function rebuildLeadingTrailing(leading: string | undefined, trailing: string | undefined): OperatorFunction<string, string> {
  return source$ => source$.pipe(
    map(content => `${leading ? `${leading}__START__\n\n` : ''
      }${content}${trailing ? `\n__END__\n${trailing}` : ''}`)
  )
}

export function startEndSplit(text: string): { leading?: string, main: string, trailing?: string } {

  const leadingChunks = text.split(startMarker)
  const tail = leadingChunks.pop()
  const trailingChunks = tail?.split(endMarker)
  const main = trailingChunks?.shift() || text

  return {
    main,
    ...leadingChunks.length && { leading: leadingChunks.join('__START__\n') },
    ...trailingChunks?.length && { trailing: trailingChunks.join('__END__\n') }
  }
}

export function parseSession(): OperatorFunction<string, Session> {
  return source$ => source$.pipe(
    map(parse)
  )
}

export function recombineWithOriginal(original: string, outputOnly = false): OperatorFunction<Session, string> {
  return source$ => source$.pipe(
    map((session) => {
      const output = `${session.pop()?.content || '×'}`
      if (outputOnly) return output
      return `${original}\n\nA>>\n\n${output}\n\nQ>>\n\n`
    })
  )
}

export function recombineSession(): OperatorFunction<Session, string> {
  return source$ => source$.pipe(
    map(session => {
      const result = session.reduceRight(
        (acc, message, i) => {
          const { role, content } = message;
          if (!visibleRoles.has(role)) {
            return acc
          }
          if (role === 'assistant' && message.tool_calls) {
            return acc
          }
          const shouldShowHeader = i != 0 || !impliedInitialRole.has(role)
          return `${shouldShowHeader ? roleToHeader[role] + '>>\n\n' : ''}${content}\n\n${acc}`
        }, ''
      )
      return result
    })
  )
}

function pair(t: string) {

  const result: Partial<{ key: string, content: string }>[] = []

  return t.split(/^(\w)>>/m).reduceRight(
    (acc, next, i) => {
      const { result, firstKey: lastFirstKey } = acc
      const isKey = i % 2 == 1;
      const clean = next.trim()

      let firstKey = lastFirstKey
      if (!isKey) {
        const index = i / 2;
        result[index] = { content: clean }
      } else {
        const index = i / 2 + .5
        firstKey = clean;
        result[index].key = clean
      }
      return { result, firstKey }
    }
    , { result, firstKey: '' })
}