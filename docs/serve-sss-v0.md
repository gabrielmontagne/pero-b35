# Ticket: `pero serve` — SSS v0

Status: Proposal (design frozen for SSS v0)
Owner: G + Q
Scope: Add a minimal HTTP server command that mirrors `pero chat` behavior with text-in/text-out over HTTP for local editor/TiddlyWiki use.

## Problem

- We want to use Pero from TiddlyWiki/editor buttons by sending the same buffer we’d pipe to `pero chat` and get the processed text back.
- The old solution supported simple POST endpoints (used in TW macros) with per-call overrides.
- We need a tiny, dependency-free server that reuses the exact chat pipeline/options and avoids future drift between CLI and server.

## Goals (SSS v0)

- One-shot requests: text in → text out. No streaming/progress API.
- Query params override server startup defaults (kebab-case only).
- CORS: wildcard “\*” (SSS v0) to work with TW on another port.
- Reuse the exact `chat` pipeline (same parsing, tools, gateways, options).
- No new dependencies (use node:http + existing code).

## Non-goals (SSS v0)

- No SSE/websocket streaming.
- No JSON responses (text/plain only) and no JSON request body required.
- No auth/rate-limiting.
- No multiple endpoints/state machines.

## CLI

- New command: `pero serve`
- Startup flags are defaults for requests (same semantics as `chat`):
  - `-H, --host` (default: 127.0.0.1)
  - `-P, --port` (default: 3535)
  - `-m, --model`
  - `-g, --gateway` (one of: openai, openrouter, anthropic, gemini, ollama, deepseek)
  - `-t, --tools` (repeatable; YAML files)
  - `--omit-tools`
  - `-p, --preamble` (repeatable; files)
  - `-o, --output-only`
  - `-r, --include-reasoning`
  - `--include-tool` (none|call|result)
  - `--tools-placement` (top|bottom)
- SSS v0: CORS hard-coded to `*` (no flag yet).

## HTTP API (SSS v0)

- Endpoint: `POST /` (we may accept any path, but `/` is the official one)
- Request:
  - Headers: `Content-Type: text/plain`
  - Body: the same buffer text you’d pipe to `pero chat`
  - Query params (all optional; kebab-case; override defaults):
    - `model=string`
    - `gateway=openai|openrouter|anthropic|gemini|ollama|deepseek`
    - `output-only=true|false`
    - `include-reasoning=true|false`
    - `include-tool=none|call|result`
    - `tools-placement=top|bottom`
    - `omit-tools=true|false`
    - `tools=/abs/path/tools1.yml` (repeat param for multiple files)
    - `preamble=/abs/path/file1.md` (repeat param for multiple files)
- Response:
  - `200 text/plain`: final processed text (identical to CLI output)
  - Errors: `400` (missing/invalid body), `500` (internal/tool errors)
- CORS: `Access-Control-Allow-Origin: *`, handle OPTIONS preflight minimally.

## Behavior parity with `chat`

- Same text format: S>>, Q>>, A>>, **START**/**END** markers.
- Same tools handling (`tools.yaml` auto-discovery + explicit tool files).
- Same recombination and options (`outputOnly`, `includeReasoning`, `includeTool`, `toolsPlacement`).
- Same gateways and `.env` keys.

## Architecture: one pipeline, different sources/sinks

- Introduce a reusable wrapper (Observables-first):
  - `runChat$(text: string, opts: ChatRunOptions): Observable<string>`
    - Internally: build the same Rx chain used by `chat.ts` (includePreamble → parseSession → scanSession → recombineWithOriginal → rebuildLeadingTrailing).
    - Semantics: emits a single string value; both CLI and server subscribe and write to their sinks.
- CLI `chat` and server `serve` both call this; only the input source (stdin vs HTTP body) and sink (stdout vs HTTP response) differ.
- Options alignment:
  - Input adapters (yargs for CLI, query parser for server) both map into the same `ChatRunOptions` shape.
  - Kebab-case only for HTTP; CLI remains kebab-case via yargs.

## Tool configuration reuse

- Extract `auto tools.yaml` resolution into a helper shared by chat/server:
  - `resolveAutoToolsPath(cwd, defaultPath) → string | null`
- Compose final tool paths in both journeys:
  - `finalToolPaths = omitTools ? [] : [autoToolsPath, ...explicitTools] (filtered)`

## TiddlyWiki migration (examples)

- Minimal call:
  - `POST http://127.0.0.1:3535/?model=openai/gpt-4o-mini&gateway=openrouter&output-only=true`
  - Body: tiddler text
  - Response: text/plain → write back to target tiddler
- Keep your existing `onprogress` UI if desired; it reflects network transfer only (not model streaming). Typical UX: set `…` before call, `✓` on completion.

## Rationale

- SSS: keep it to one endpoint, text/plain, and wildcard CORS for local workflows.
- No new deps and no duplicate logic: reuse the existing pipeline and tool system.
- Alignment by design: single options interface (`ChatRunOptions`) with thin input adapters.
- Easy to extend later without breaking SSS v0.

## Future (out of scope for SSS v0)

- `--cors` flag with exact origins or list.
- JSON body and/or JSON output (Accept negotiation).
- SSE token streaming.
- Central options descriptor exported to DRY yargs + query parsing further.
- Memoize default tool config between requests.
- Optional `--auth-token` bearer check.
- Limits (max body size) and rate-limiting for safety.

## Implementation plan (checklist)

- [ ] Factor a `runChat$(text, opts): Observable<string>` that wraps current Rx pipeline
- [ ] Share: auto tools path resolution + final tool paths computation
- [ ] Add `serve` command with flags mirroring `chat` defaults (host/port added)
- [ ] Implement node:http server - [ ] Hard-code CORS `*` and handle OPTIONS - [ ] Parse query params (kebab-case), coerce booleans, collect repeatable arrays - [ ] Read text/plain body (UTF-8) - [ ] Merge query overrides onto startup defaults - [ ] Subscribe to `runChat$` and respond with the single emitted text/plain value
- [ ] README/docs: minimal usage + TW snippet
- [ ] Vitest minimal integration - [ ] `runChat$` parity with `chat` for a fixture - [ ] POST / returns non-empty text/plain - [ ] Query overrides honored - [ ] omit-tools parity with CLI - [ ] OPTIONS responds with CORS headers

## Quick usage (target)

- Start: `pero serve -H 127.0.0.1 -P 3535 -m openai/gpt-4o -g openrouter -o`
- Call: `curl -s -X POST 'http://127.0.0.1:3535/?model=openai/gpt-4o-mini&gateway=openrouter&output-only=true' --data-binary @buffer.txt > out.txt`
