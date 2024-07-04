import { MonoTypeOperatorFunction, Observable, scan, tap } from "rxjs";

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
    scan((acc, content) => acc + content, '')
  );
}