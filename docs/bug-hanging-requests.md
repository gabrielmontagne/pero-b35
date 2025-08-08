# Bug: HTTP Requests Hang on File Errors Despite Error Handling

**Status:** Open  
**Priority:** High  
**Reporter:** G  
**Date:** 2025-08-08  

## Problem

HTTP requests hang indefinitely when file interpolation errors occur, despite having both Observable-level and process-level error handling in place.

## Symptoms

1. **Request hangs:** TiddlyWiki macro shows "pending" status indefinitely
2. **Process-level handler fires:** Server logs "Uncaught Exception - Server staying alive" with file not found error
3. **HTTP response never sent:** Client receives no response (not even an error)
4. **Server stays alive:** Process doesn't crash, but specific request is stuck

## Error Details

```
Uncaught Exception - Server staying alive: [Error: ENOENT: no such file or directory, open 'wiki/tiddlers/PromptRelojDeSangre.txt'] {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: 'wiki/tiddlers/PromptRelojDeSangre.txt'
}
```

## Current Error Handling

We have two layers:

1. **Observable-level** (`serve.ts:194-202`):
   ```typescript
   runChat$(body, options)
     .pipe(
       catchError(err => {
         console.error('Chat processing error:', err)
         const statusCode = 400
         const message = err.message || 'Processing error'
         return throwError(() => ({ statusCode, message }))
       })
     )
   ```

2. **Process-level** (`serve.ts:231-242`):
   ```typescript
   process.on('uncaughtException', (err) => {
     console.error('Uncaught Exception - Server staying alive:', err)
   })
   ```

## Root Cause Investigation Needed

**Key question:** Why is the file error escaping the Observable `catchError()` and reaching the process-level handler?

**Suspects:**
1. **Async operations not properly wrapped** - File operations in `interpolate.ts` might be using callbacks/Promises that don't propagate errors to the Observable stream
2. **Multiple Observable streams** - Error might be in a nested/parallel Observable that's not covered by our `catchError`
3. **Timing issue** - Error occurs after Observable completion but before HTTP response
4. **Pipeline composition** - Error happens in a part of `runChat$()` pipeline that's outside our error boundary

## Debugging Approach

1. **Add more granular logging** in `runChat$()` pipeline to see exactly where the error occurs
2. **Audit file operations** in `interpolate.ts` for unhandled async operations  
3. **Test Observable error propagation** with synthetic file errors
4. **Add request timeout** as temporary mitigation (but not preferred solution)

## Expected Behavior

File errors should:
1. Be caught by Observable `catchError()`
2. Return HTTP 400 with descriptive error message
3. Never reach process-level handlers
4. Allow subsequent requests to work normally

## Current Workaround

Server stays alive but requests hang. Manual restart required to clear hung requests.

## Next Steps

Debug why file errors are escaping Observable error handling before adding timeout-based mitigations.