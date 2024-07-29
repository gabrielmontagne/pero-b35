import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { MonoTypeOperatorFunction, from, map, switchMap } from "rxjs";
import { flog } from "./log";
import { ToolsConfig, runToolsIfNeeded } from "./tools";

export type Session = ChatCompletionMessageParam[]


export function scanSession(tools: ToolsConfig): MonoTypeOperatorFunction<Session> {
  return source$ => source$.pipe(
    switchMap(session => {
      const openai = new OpenAI()
      return from(
        openai.chat.completions.create(
          {
            model: 'gpt-4o',
            messages: session,
            tools: tools.api,
            tool_choice: 'auto'
          }
        )
      ).pipe(
        flog('Raw response'),
        runToolsIfNeeded(tools.commandByName),
        map(response => response.choices.map(c => c.message)),
        map(choices => ([...session, ...choices])),
      )
    }
    ))
}