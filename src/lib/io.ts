import { combineLatest, map, MonoTypeOperatorFunction, Observable, of, reduce, scan, tap } from "rxjs";
import { flog } from "./log";

export function pout<T>(): MonoTypeOperatorFunction<T> {
  return source$ => source$.pipe(
    tap(content => process.stdout.write(forceString(content)))
  )
}

export function out<T>() {
  return {
    next: (n: T) => process.stdout.write(forceString(n))
  }
}

export function forceString(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!content) {
    return '';
  }

  return JSON.stringify(content, null, 2);
}

export function createInputTextFiles$(files: string[]) {
  if (!files.length) return of('')
  return combineLatest(
    files.map(file => createInputText$(file))
  ).pipe(
    flog('BEFORE MAP'),
    map(files => files.join('\n\n'))
  )
}

export function createInputText$(file?: string) {

  return new Observable<string>(o => {
    const contentStream = file ?
      require("fs").createReadStream(file) : process.stdin;

    contentStream.on("data", (chunk: object) => {
      o.next(chunk.toString());
    });

    contentStream.on("end", () => {
      o.complete();
    });
  }).pipe(
    reduce((acc, content) => acc + content, '')
  );
}