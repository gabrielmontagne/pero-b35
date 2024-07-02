import { OperatorFunction, map } from "rxjs";
import { Session } from "./scan";

export function parse(text: string): Session {
    return [
        { role: 'user' as const, content: text }
    ]
}

export function parseSession():OperatorFunction<string, Session> {
  return source$ => source$.pipe(
    map(parse)
  )
}