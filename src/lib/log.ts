import { Observable } from "rxjs";
import * as fs from "fs";
import * as path from "path";

const logFilePath = path.join('/tmp', 'pero-chat.log')

const algo$ = new Observable<number>(observer => {
  observer.next(1);
  observer.complete();
});

algo$.subscribe(log('Uno'))

export function log<T>(context: string) {
  return {
    next: (n: T) => logToFile(`[NXT ${context}] ${JSON.stringify(n, null, 2)}`),
    error: (e: Error) => logToFile(`[ERR ${context}] ${e.message} ${e.stack}`),
    complete: () => logToFile(`[COM ${context}]`)
  }
}

function logToFile(content: string) {
  try {
    fs.appendFileSync(logFilePath, `${content}\n`)
  } catch (e) {
    console.error(`Failed to log to ${logFilePath}:`, e)
  }
}