import { OperatorFunction, map } from "rxjs";
import { Session } from "./scan";
import { ChatCompletionRole } from "openai/resources";

const startMarker = /^__START__\s*\n/m
const endMarker = /^__END__\s*\n/m

const roleToHeader: Record<ChatCompletionRole, string> = {
  system: 'S>>',
  user: 'Q>>',
  assistant: 'A>>',
  tool: 'T>>',
  function: 'F>>'
}

const impliedInitialRole = new Set<ChatCompletionRole>(['system', 'user'])


export function parse(text: string): Session {
  return [
    { role: 'user' as const, content: text }
  ]
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

export function recombineSession(): OperatorFunction<Session, string> {
  return source$ => source$.pipe(
    map(session => {
      console.log('RECOMBINE', session);
      const result = session.reduceRight(
        (acc, message, i) => {
          const { role, content } = message;
          const shouldShowHeader = i != 0 || !impliedInitialRole.has(role)
          return `${shouldShowHeader ? roleToHeader[role] + '\n\n' : ''}${content}\n\n${acc}`

        }, ''
      )
      return result
    })
  )
}