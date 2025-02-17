import * as fs from "fs";
import * as path from "path";
import { MonoTypeOperatorFunction, tap } from "rxjs";
import { forceString } from "./io";

const logFilePath = path.join(__dirname, '..', '..', 'pero-chat.log')

export function log<T>(context: string) {
  return {
    next: (n: T) => logToFile(`[NXT ${context}] ${forceString(n)}`),
    error: (e: Error) => logToFile(`[ERR ${context}] ${e.message} ${e.stack}`),
    complete: () => logToFile(`[COM ${context}]`)
  }
}

export function flog<T>(context: string): MonoTypeOperatorFunction<T> {
  return source$ => source$.pipe(
    tap(log(context))
  )
}

export function logToFile(content: string) {
  try {
    fs.appendFileSync(logFilePath, `${content}\n`)
  } catch (e) {
    console.error(`Failed to log to ${logFilePath}:`, e)
  }
}