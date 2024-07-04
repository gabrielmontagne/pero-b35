import { OperatorFunction, map } from "rxjs";
import { Session } from "./scan";

const startMarker = /^__START__\s*\n/m
const endMarker = /^__END__\s*\n/m

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