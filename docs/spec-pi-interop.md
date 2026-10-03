# Spec — Pi interop: `pero export` / `pero import`

Status: shipped for A (2026-09-25). B is not this branch.
Author: G + Q
Related: pi `docs/session-format.md`

## Motivation

Two flows we want:

- **A — interop**: turn a pero flat chat into a pi conversation that can be
  picked up (`pi --resume`), and the reverse, print a pi conversation to an
  editable pero flat chat.
- **B — re-engine**: eventually move pero's hand-rolled OpenAI backend onto
  `@earendil-works/pi-ai`, to stop chasing provider-compat ourselves.

This spec is **A only**, but written so it *heads toward* B rather than away
from it.

### A is not blocked by B

A is a pure **format translation**:

```
pero.txt  ──parse()──►  Session (msgs)  ──map──►  pi JSONL entries
pi.jsonl  ──walk leaf→root──►  msgs      ──recombine──►  pero.txt
```

Both directions reuse functions pero already has (`parse`,
`recombineWithOriginal`, `makeToolsBlock`, the `@@.think` rendering). The new
code is two mappers between pero's `Session` and pi's entry JSON.

Writing those two mappers *is* the B migration spec: it forces us to enumerate
exactly where pero's model and pi's model diverge (tool calls, reasoning, image
content, usage/cost). So A de-risks B; B is not a precondition for A.

## CLI surface

Mirror `chat` exactly. `createInputText$(file?)` already does "`-f file`, else
stdin", and both `chat` and `serve` use it. Same muscle memory:

```sh
# now
cat conv.txt | pero chat
pero chat -f conv.txt

# export: flat chat → pi session JSONL
cat conv.txt | pero export > session.jsonl
pero export -f conv.txt > session.jsonl

# import: pi session JSONL → flat chat
cat session.jsonl | pero import
pero import -f session.jsonl
```

Vim, same reflex:

- `:%!pero export` — buffer becomes JSONL
- `:%!pero import` — JSONL buffer becomes an editable flat chat
- then `:%!pero chat` again

Both verbs are **pure text transforms** — no API, no gateway. Stay idiomatic:
reuse `createInputText$` + `out()`, keep flows Observable end-to-end (house
rule), bridge only at the JSON boundary.

## The B-shaped seam

The whole point of the dependency question: *should pero lean on pi to emit the
JSON?*

Decision for A: **no new dependency yet.** The session JSONL is plain, stable,
and documented. Hand-emitting entries is ~30 lines and adds zero deps; pulling
`pi-ai`/`SessionManager` in just to `JSON.stringify` would violate pero's own
SSS rule.

But we isolate the mapping behind one boundary so B is a swap, not a rewrite:

```
restructure.ts  ──Session──►  [ session-codec.ts ]  ──pi entries──►  JSONL
                              ^^^^^^^^^^^^^^^^^^^^^^
                              the only place that knows pi's wire shape
```

`session-codec.ts` is the single module that knows pi's entry shapes. Today it
maps from pero's local OpenAI `Session`. When B lands, pero's internal message
type *becomes* `pi-ai`'s, and this module either thins out or delegates to
`pi-ai` — but no other file changes. Dependency deferred, not designed out.

## Mapping table — pero `Session` ⟷ pi entries

Pi entries are a tree (`id`/`parentId`); pero is a line. For A we use a **linear
chain**: each entry's `parentId` is the previous entry's `id`. On import we walk
the **current leaf → root** path and linearize it.

| pero (flat / Session)        | pi entry (`type:"message"` unless noted) | direction notes |
|------------------------------|------------------------------------------|-----------------|
| `S>>` / `role:"system"`      | **not a session entry** — runtime config       | resolved: see System messages |
| `Q>>` / `role:"user"` text   | `message.role:"user"`, `content:[{type:"text",text}]` | ↔ |
| `A>>` / `role:"assistant"`   | `message.role:"assistant"`, `content:[{type:"text"...}]`, plus `provider`/`model`/`usage`/`stopReason` | export must synthesize required fields (placeholders); import drops them |
| `@@.think` block             | assistant `content:[{type:"thinking",thinking}]` | ↔ via existing reasoning render |
| `@@.tools` block (call+result) | **stays inline as text** inside the assistant `content[].text` | export: ride along verbatim; not reconstructed as `toolCall`/`toolResult` entries. import: a pi `toolResult` entry renders back to an `@@.tools` block via `makeToolsBlock` |
| `[img[path]]` (literal)      | **left literal for A** — see Images       | not resolved either way for now |
| (none)                       | `compaction` | import: latest compaction on the leaf path; summary kept as `A>>` with a `%%% compaction` line; entries before `firstKeptEntryId` dropped. export never emits |
| (none)                       | `branch_summary`, `custom_message`, `bashExecution` | import: kept as conversation text, because pi would send them. export never emits |
| (none)                       | `model_change` / `label` / `custom` / `context_edit` / `usage` | import: dropped. `context_edit` is not applied |

### Header

Export emits the first JSONL line:

```json
{"type":"session","version":3,"id":"<uuid>","timestamp":"<iso>","cwd":"<cwd>"}
```

`cwd` = `process.cwd()` (so the file lands under the right pi sessions dir if
copied there). `id` = fresh uuid. Version pinned to 3.

### Lossy-but-honest

- pi tree → pero line: file-order leaf → root. Other branches are dropped.
- usage/cost/`stopReason`/`provider` → not part of pero's buffer; **dropped on
  import**, **synthesized as pi `Usage` placeholders on export** (nested under
  `message`, not on the entry). Zeroed `input`/`output`/`cacheRead`/
  `cacheWrite`/`totalTokens`/`cost`. The June `prompt_tokens` shape will not
  load.
- Infra entries (`model_change`, `label`, `custom`, `usage`) are dropped.
  Compaction is honored. See the mapping table.

## Images — don't solve, don't corner

We use **paths** in pero (`[img[path]]`), resolved lazily at chat time by
`interpolate()` (async). Pi stores **base64 image content blocks** inline.

For A we deliberately **do not convert**:

- **Export**: do *not* run `interpolate()`. Keep `[img[path]]` literal in the
  text content. The roundtrip stays editable and the transform stays sync.
- **Import**: if a pi message carries a base64 image block, we **do not** inline
  base64. Shipped choice: a text marker, `[image omitted: mime]`, so the turn
  survives re-export. Writing the bytes to a sibling file and emitting
  `[img[path]]` is still the attractive later move, and it stays inside
  `session-codec.ts`.

**Corner avoided**: because export keeps images literal (no interpolation), both
verbs stay synchronous and consistent. We don't bake base64 into the flat format
and then have to unbake it. The image decision is a *later, additive* choice in
`session-codec.ts`, not a format change.

## Resolved (probe against ~/Documents/pi, step 1)

### System messages — resolved

June probe: pi did not persist a system message in the JSONL. That is no longer
true — current sessions store `role:"system"` entries for the prompt and tool
loadout. The decision is unchanged: that text is infra, not the buffer.
Export still drops `S>>`. Import still drops pi system messages and emits no
`S>>`.

Consequences:
- **Export**: `S>>` has nowhere to go as a message entry. Options:
  (a) drop it (simplest, default), or (b) fold it into the first `user` message
  as a labelled preamble. Pick (a) for A; note we lose the system text on
  roundtrip. (If we ever want fidelity, a `custom`/`custom_message` entry could
  carry it, but that's B-territory.)
- **Import**: drop pi system messages. Produce **no `S>>`**. The flat chat
  starts at the first `Q>>`/`A>>`. Pi supplies its own prompt on resume.

### Resume validation — resolved

Loading is `JSON.parse` per line with **skip-malformed** and no schema
validation (`session-manager.ts` `parseSessionContent`). Migration only bumps
`version`. `buildSessionContext` does **not** read `usage`/`stopReason` to build
the LLM context — they're accounting/display only. So **synthesized placeholder
`usage`/`stopReason` on export are safe**. Pin header `version: 3`
(`CURRENT_SESSION_VERSION = 3`). Still worth one real `pi --resume` smoke test,
but nothing in the loader rejects placeholders.

**Smoke test — passed (2026-06-06).** Hand-wrote a 2-message JSONL with the
minimal placeholder below into
`~/.pi/agent/sessions/--tmp-pero-pi-smoke--/<ts>_<uuid>.jsonl` (cwd
`/tmp/pero-pi-smoke`). Results:
- `SessionManager.open(F)` loaded it, `getEntries()`==2, leaf==assistant,
  `buildSessionContext()` returned both messages verbatim (placeholders intact).
- `pi --session <F> -p "..."` resumed it and ran a real turn on top (exit 0,
  file grew to 6 entries). No validation errors, no schema rejection.

Conclusion: placeholder `usage`/`stopReason`/`api`/`provider`/`model` are fully
accepted by both the SDK loader and the `--session` resume path. Step 1 closed.

Minimal placeholder, nested under `message` (not on the entry):
`provider:"pero"`, `model:<from -m or "unknown">`, `api:"openai-completions"`,
`stopReason:"stop"`, pi `Usage` all-zero (`input`, `output`, `cacheRead`,
`cacheWrite`, `totalTokens`, `cost`). First tree entry has `parentId: null`.
The header is not a parent. `pi --session` will not restore `pero/unknown` as
the active model; it falls back to the user's default.

## Principle — buffer carries the conversation, infra stays private

(G, 2026-06-06.) The flat buffer is the *visible conversation* only. Each side
keeps its own infrastructure private and we do **not** bridge it:

- **Pero's** tools (`tools.yaml`), preambles (`-p`), and any extra prompts stay
  out of the buffer — as they already do.
- **Pi's** system prompt / resource-loader layer stays pi's. Export emits no
  system entry; pi supplies its own at resume (smoke-tested).

This resolves the tool question too: on **export**, an `@@.tools` block is just
text that rides along inside the assistant message. It's context for the agent,
never re-run — we couldn't reliably re-run it anyway (tool sets won't match).
No `toolCall`/`toolResult` entry reconstruction. On **import**, a pi
`toolResult` entry is rendered back into an `@@.tools` block with the existing
`makeToolsBlock`, so the roundtrip reads naturally.

## Shipped (2026-09-25)

A is in `session-codec.ts`, `export`, and `import`. No `pi-ai` dependency.
The June draft emitted a flat entry (`role`/`content` on the entry itself).
Current pi will not resume that. The codec now matches `session-format.md`:

- Header is metadata only. First tree entry has `parentId: null`.
- A turn is `{"type":"message", id, parentId, timestamp, message: {...}}`.
- Assistant placeholders use pi's `Usage` (`input`/`output`/`cacheRead`/
  `cacheWrite`/`totalTokens`/`cost`), `provider: "pero"`, `api:
  "openai-completions"`, `stopReason: "stop"`. Resume falls back to the
  user's default model if `pero/unknown` is not configured. That is intended.
- Export parses with `parseFlat` (no `interpolate`). `[img[path]]` stays literal.
- Import walks the file-order leaf to root, then applies pi's compaction rule
  (latest compaction, keep from `firstKeptEntryId`). The summary is an `A>>`
  prefixed with `%%% compaction`, so it is visible and survives re-export as
  text. Other branches are dropped.
- `toolResult` folds into the calling assistant as `@@.tools` via
  `makeToolsBlock`. Export does not reconstruct `toolCall` entries.
- System messages are dropped both ways. `model_change`, labels, and other
  infra entries are dropped. `branch_summary`, `custom_message`, and
  `bashExecution` are kept as conversation text because pi would send them.
- Images in a pi message become `[image omitted: mime]`, never base64.
- `context_edit` is not applied. A session that relies on one will import the
  original entry text.

`SessionManager.open` of an export loads and `buildSessionContext()` returns
the turns. Import of a real session round-trips back through the same loader.

## Open questions

1. **`context_edit`**: still dropped. Revisit if a real session loses a turn
   that pi would have rewritten.
2. **Image files on import**: still a marker, not a sibling file. Additive
   later, inside `session-codec.ts` only.

## Build order (SSS)

1. ~~Confirm system + resume validation; smoke-test placeholder resume.~~
   **DONE**.
2. ~~`session-codec.ts`~~ **DONE.**
3. ~~`export` command~~ **DONE.** Uses `parseFlat`, not interpolating `parse`.
4. ~~`import` command~~ **DONE.**
5. ~~Roundtrip vitest~~ **DONE** (`session-codec.spec.ts`). Byte-identical
   roundtrip is not the goal: `S>>`, usage, and branches do not come back.

## Non-goals (A)

- Branch/tree fidelity (we linearize the current leaf).
- Faithful usage/cost preservation through pero.
- Base64 image inlining into the flat buffer.
- Any change to the existing `chat` / `serve` flows.
- Moving the chat backend onto `pi-ai`.
