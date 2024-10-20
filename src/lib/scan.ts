import { OpenAI } from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { MonoTypeOperatorFunction, catchError, from, map, of, switchMap } from "rxjs";
import { flog } from "./log";
import { ToolsConfig, runToolsIfNeeded } from "./tools";

export type Session = ChatCompletionMessageParam[]


export function scanSession(tools: ToolsConfig | null, depth=0): MonoTypeOperatorFunction<Session> {
  return source$ => source$.pipe(
    switchMap(session => {

      const openai = new OpenAI()
      return from(
        openai.chat.completions.create(
          {
            model: 'gpt-4o',
            messages: session,
            ...(
              tools && {
                tools: tools.api,
                tool_choice: 'auto'
              }
            )
          }, 
        )
      ).pipe(
        flog('Raw response'),
        runToolsIfNeeded(tools?.commandByName),
        map(response => response.choices.map(c => c.message)),
        map(choices => ([...session, ...choices])),
        catchError(e => {

          if (depth > 3) {
            throw new Error('Too many tool calls')
          }

          // TODO: why is instanceof not working?
          if (e.toolsMessages) { 
            const toolMessages = e.toolsMessages
            const sessionWithTools = [ ...session, ...toolMessages ]
            return of([...sessionWithTools]).pipe(scanSession(tools, depth + 1))

          }
          throw e;
        }),
      )
    }
    ))
}