import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources";
import { MonoTypeOperatorFunction, from, map, switchMap } from "rxjs";
import { flog } from "./log";

export type Session = ChatCompletionMessageParam[]


export function scanSession(): MonoTypeOperatorFunction<Session> {
  return source$ => source$.pipe(
    switchMap(session => {
      const openai = new OpenAI()
      return from(
        openai.chat.completions.create(
          {
            model: 'gpt-4o',
            messages: session,
          }
        )
      ).pipe(
        flog('Raw response'),
        map(response => response.choices.map(c => c.message)),
        map(choices => ([...session, ...choices ])),
      )
    }
    ))
}