import { OpenAI } from 'openai'
import { ChatCompletionMessageParam } from 'openai/resources'
import {
  MonoTypeOperatorFunction,
  catchError,
  from,
  map,
  of,
  switchMap,
} from 'rxjs'
import { flog } from './log'
import { ToolsConfig, runToolsIfNeeded } from './tools'

export type Session = ChatCompletionMessageParam[]

export function scanSession({
  tools,
  model,
  gatewayConfig,
  includeReasoning,
  maxTokens,
  reasoningEffort,
  depth = 0,
}: {
  tools: ToolsConfig | null
  model: string
  depth?: number
  gatewayConfig: {
    baseURL?: string
    apiKey?: string
    audioFormat?: 'openai' | 'gemini'
  }
  includeReasoning?: boolean
  maxTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
}): MonoTypeOperatorFunction<Session> {
  return (source$) =>
    source$.pipe(
      switchMap((session) => {
        const openai = new OpenAI(gatewayConfig)
        return from(
          openai.chat.completions.create({
            model,
            messages: session,
            ...((includeReasoning || reasoningEffort) && {
              include_reasoning: true,
            }),
            ...(reasoningEffort && { reasoning: { effort: reasoningEffort } }),
            ...(maxTokens && { max_tokens: maxTokens }),
            ...(tools && {
              tools: tools.api,
              tool_choice: 'auto',
            }),
          } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming)
        ).pipe(
          flog('Raw response'),
          runToolsIfNeeded(tools?.commandByName),
          map((response) => {
            const choices = response.choices.map((c) => c.message)
            const annotations =
              (response.choices[0] as any)?.message?.annotations || []
            return { choices, annotations }
          }),
          map(({ choices, annotations }) => {
            const lastMessage = choices[choices.length - 1]
            if (lastMessage && annotations.length > 0) {
              ;(lastMessage as any).annotations = annotations
            }
            return [...session, ...choices]
          }),
          catchError((e) => {
            if (depth > 20) {
              throw new Error('Too many tool calls')
            }

            if ((e as any).toolsMessages) {
              const toolMessages = (e as any).toolsMessages
              const sessionWithTools = [...session, ...toolMessages]
              return of([...sessionWithTools]).pipe(
                scanSession({
                  tools,
                  model,
                  depth: depth + 1,
                  gatewayConfig,
                  includeReasoning,
                  reasoningEffort,
                })
              )
            }
            throw e
          })
        )
      })
    )
}
