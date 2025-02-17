import { ClientOptions, OpenAI } from "openai";
import { ChatCompletion, ChatCompletionMessageParam } from "openai/resources";
import { MonoTypeOperatorFunction, catchError, from, map, of, switchMap, tap } from "rxjs";
import { flog, logToFile } from "./log";
import { ToolsConfig, runToolsIfNeeded } from "./tools";
import { includePreamble } from "./restructure";
import { log } from "console";

export type Session = ChatCompletionMessageParam[]

export function scanSession(
  {
    tools, model,
    gatewayConfig,
    depth = 0,
    includeReasoning
  }: {
    tools: ToolsConfig | null,
    model: string,
    depth?: number
    gatewayConfig: { baseURL: string, apiKey: string },
    includeReasoning?: boolean
  }
): MonoTypeOperatorFunction<Session> {
  return source$ => source$.pipe(
    switchMap(session => {
      const openai = new OpenAI(gatewayConfig)
      return from(
        openai.chat.completions.create(
          {
            model,
            messages: session,
            ...(includeReasoning && { include_reasoning: true }),
            ...(
              tools && {
                tools: tools.api,
                tool_choice: 'auto'
              }
            )
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
        )
      ).pipe(
        flog('Raw response'),
        runToolsIfNeeded(tools?.commandByName),
        tap(logReasoningIfPresent),
        map(response => response.choices.map(c => c.message)),
        map(choices => ([...session, ...choices])),
        catchError(e => {

          if (depth > 20) {
            throw new Error('Too many tool calls')
          }

          // TODO: why is instanceof not working?
          if (e.toolsMessages) {
            const toolMessages = e.toolsMessages
            const sessionWithTools = [...session, ...toolMessages]
            return of([...sessionWithTools]).pipe(
              scanSession({ tools, model, depth: depth + 1, gatewayConfig }))

          }
          throw e;
        }),
      )
    }
    ))
}

function logReasoningIfPresent(response: ChatCompletion) {
  response.choices.forEach(
    c => {
      const m = c.message
      if ('reasoning' in m) {
        logToFile(`[REASONING: ${m.reasoning}]`)
      }
    }
  )
}