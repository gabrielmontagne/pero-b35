import { OpenAI } from 'openai'
import { Observable, from, map, of, switchMap, combineLatest } from 'rxjs'
import { GatewayConfig, GatewayName, gatewayConfig } from './gateways'
import { createInputTextFiles$ } from './io'
import { flog } from './log'
import { rebuildLeadingTrailing, startEndSplit } from './restructure'

export interface CompleteRunOptions {
  model: string
  gateway: GatewayName
  preamble: string[]
  outputOnly: boolean
  maxTokens?: number
  temperature?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string[]
  n?: number
  seed?: number
}

const commentLine = /^%%%.*$\n?/gm

export function stripComments(text: string): string {
  return text.replace(commentLine, '')
}

export function completePrompt$(
  prompt: string,
  options: CompleteRunOptions,
  config: GatewayConfig
): Observable<string[]> {
  const {
    model,
    maxTokens,
    temperature,
    topP,
    frequencyPenalty,
    presencePenalty,
    stop,
    n,
    seed,
  } = options

  const openai = new OpenAI(config)

  return from(
    openai.completions.create({
      model,
      prompt,
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
      ...(temperature !== undefined && { temperature }),
      ...(topP !== undefined && { top_p: topP }),
      ...(frequencyPenalty !== undefined && {
        frequency_penalty: frequencyPenalty,
      }),
      ...(presencePenalty !== undefined && {
        presence_penalty: presencePenalty,
      }),
      ...(stop?.length && { stop }),
      ...(n !== undefined && { n }),
      ...(seed !== undefined && { seed }),
      stream: false,
    })
  ).pipe(
    flog('Raw completion response'),
    map((response) => response.choices.map((c) => c.text ?? ''))
  )
}

export function runComplete$(
  text: string,
  options: CompleteRunOptions
): Observable<string> {
  const { gateway, preamble, outputOnly } = options
  const config = gatewayConfig(gateway)

  return combineLatest({
    preamble: createInputTextFiles$(preamble),
    input: of(text).pipe(map(startEndSplit)),
  }).pipe(
    switchMap(({ preamble: pre, input: { main, leading, trailing } }) => {
      const original = stripComments(main)
      const prompt = pre ? `${pre}\n\n${original}` : original

      return completePrompt$(prompt, options, config).pipe(
        map((texts) =>
          texts.length > 1
            ? texts
                .map((t, i) => `%%% --- completion ${i + 1} ---\n${t}`)
                .join('\n')
            : (texts[0] ?? '')
        ),
        map((completion) =>
          outputOnly ? completion : `${original}${completion}`
        ),
        rebuildLeadingTrailing(leading, trailing)
      )
    })
  )
}
