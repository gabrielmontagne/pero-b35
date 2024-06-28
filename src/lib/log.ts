import { Observable } from "rxjs";

const algo$ = new Observable<number>(observer => {
  observer.next(1);
  observer.complete();
});

algo$.subscribe(log('Uno'))


export function log<T>(context: string) {
  return {
    next: (n: T) => console.log(`[NXT ${context}]`, JSON.stringify(n, null, 2)),
    error: (e: unknown) => console.error(`[ERR ${context}]`, e),
    complete: () => console.log(`[COM ${context}]`)
  }
}
