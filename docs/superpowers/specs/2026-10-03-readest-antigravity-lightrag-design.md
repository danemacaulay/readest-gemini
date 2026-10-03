# Design: Readest + Antigravity + LightRAG Reader

**Date:** 2026-10-03  
**Status:** Draft for implementation planning  
**Repo:** `reader` (greenfield; soft-fork of [Readest](https://github.com/readest/readest))

## Goal

A macOS EPUB/PDF reader based on a soft-fork of Readest where the user can highlight text and ask questions. Answers come from **Antigravity CLI** (`agy`) using the user’s Google / AI credits subscription. Optionally, the user can ground a question in their existing **`lib-rag` LightRAG** index; retrieved sources appear as citation chips and are injected into the model prompt.

## Non-goals (v1)

- Readest’s built-in Reedy / book-local RAG
- Rich LightRAG graph visualization in the reader
- Web, Windows, Linux, or mobile targets
- Replacing or removing Readest’s upstream AI providers for all users (Antigravity is the default happy path)
- Cross-device sync of AI conversations
- Always-on library grounding (library use is opt-in)

## Constraints and decisions

| Decision | Choice |
|---|---|
| Reader shell | Soft-fork Readest (AGPL-3.0); UX/architecture inspired by upstream |
| Platform | macOS desktop (Tauri) only |
| Chat model path | Antigravity CLI (`agy`), not Gemini CLI |
| Retrieval | Existing `lib-rag` LightRAG index only |
| Library grounding | Opt-in: **Ask** vs **Ask with library** |
| Visual indicators | Minimal: source chips/citations in the chat panel |
| Integration style | In-app adapters (no separate bridge daemon) |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Reader (forked Readest, macOS)                             │
│  ┌──────────────┐  selection   ┌──────────────────────────┐ │
│  │ EPUB/PDF     │ ──────────▶  │ Ask / Ask with library   │ │
│  │ + highlights │              └───────────┬──────────────┘ │
│  └──────────────┘                          │                │
│                           ┌────────────────┼────────────┐   │
│                           ▼                ▼            │   │
│                  AntigravityProvider   LightRAGClient   │   │
│                     (Tauri shell)      (HTTP → lib-rag) │   │
│                           │                │            │   │
│                           └───────┬────────┘            │   │
│                                   ▼                     │   │
│                         Chat panel + source chips       │   │
└─────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
   `agy` (local CLI)              lib-rag query API
   Google account / credits       existing LightRAG index
```

**Boundaries**

- **Readest fork** owns reading, selection, highlights, and chat UI.
- **AntigravityProvider** is the only required chat completion path for v1.
- **LightRAGClient** is retrieve-only; it never answers the user by itself.
- **`lib-rag`** remains a separate project; this work adds a thin HTTP query surface if one is missing (viz search exists today; full retrieval is largely CLI-shaped).

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| Selection actions | Highlight popup: **Ask**, **Ask with library** | Readest selection / CFI |
| Chat panel | Thread UI, streamed replies, source chips under assistant turns | AntigravityProvider, LightRAGClient |
| AntigravityProvider | Chat completion via `agy` headless; parse stdout / `stream-json` | Tauri shell, local `agy` auth |
| PromptBuilder | System + selection + optional library context + question; token budget / truncation | — |
| LightRAGClient | `retrieve(query, selection?)` → structured sources | `lib-rag` HTTP |
| lib-rag query API | FastAPI route wrapping existing retrieval / `query_rag` path; returns citeable chunks/entities | Existing index + config |
| Settings | `agy` binary path, lib-rag base URL, LightRAG mode (default `hybrid`), grounding toggle defaults | Local prefs |

### Antigravity invocation (v1)

- Prefer headless: `agy -p "<prompt>" --output-format stream-json` (aliases `--print` / `--prompt`).
- Use cached interactive login (user signs in once via `agy`); do not hang waiting for browser auth from the reader.
- Lock down tool permissions / sandbox so Ask flows are answer-oriented and do not roam or edit the filesystem by default.
- Multi-turn: use `--continue` / `--conversation` only if session continuity proves reliable; otherwise v1 may be one-shot per Ask with full prompt context.

### LightRAG retrieve contract (v1)

```ts
type LightRAGSource = {
  id: string;
  title: string;
  snippet: string;
  score?: number;
  bookId?: string;
  bookTitle?: string;
  entityType?: string;
};

type LightRAGRetrieveResult = {
  sources: LightRAGSource[];
  // optional raw retrieval text if lib-rag returns a composed context block
  contextText?: string;
};
```

Chips are rendered from `sources` produced by retrieval, not from model-invented citations.

## Data flow

### Ask (selection only)

1. User highlights text → **Ask** (enters / confirms question).
2. PromptBuilder packs book metadata + selection (+ location/CFI) + question.
3. AntigravityProvider runs headless `agy` and streams the reply into the chat panel.
4. No source chips.

### Ask with library

1. User highlights text → **Ask with library**.
2. LightRAGClient queries `lib-rag` using question + selection.
3. Ranked sources returned; PromptBuilder injects a capped “Library context” block and instructs the model to refer to source ids.
4. Antigravity completes as in Ask.
5. Chat shows source chips under the assistant turn (from the retrieve step).

### Preconditions

- `agy` installed and authenticated once interactively.
- For library grounding, local `lib-rag` query server running. Plain **Ask** works without it.

## Error handling

| Failure | Behavior |
|---|---|
| `agy` missing / not on PATH | Settings error + install hint; disable Ask actions |
| `agy` not authenticated | Message: run `agy` once to sign in; do not spin forever |
| `agy` timeout / non-zero exit | Error in chat turn; preserve selection + draft question |
| lib-rag unreachable | **Ask with library** fails fast; offer fallback to plain **Ask** |
| Zero LightRAG hits | Still call Antigravity; chips show “No library sources”; prompt notes empty context |
| Oversized selection / context | Truncate with visible notice; keep selection + top-k sources under budget |
| Stream parse failure | Fall back to plain-text stdout if present; else error turn |

Never silently claim library grounding succeeded when retrieval failed.

## Testing

- **Unit:** PromptBuilder packing/truncation; LightRAGClient → chip mapping; Antigravity `stream-json` / stdout parser.
- **Integration (local):** mocked `agy` binary + mocked lib-rag HTTP; both selection actions.
- **Manual (macOS):** real EPUB Ask; Ask with library against the live index; missing-auth and server-down paths.
- Live Antigravity credit calls are optional smoke tests, not CI-blocking.

## License and fork notes

- Upstream Readest is **AGPL-3.0**. This soft-fork inherits AGPL obligations for distributed builds.
- Prefer additive modules (provider, client, selection actions, settings) over deep rewrites of foliate/PDF pipelines.
- Track upstream Readest periodically; keep AI/LightRAG changes in clearly named modules to reduce merge pain.

## Success criteria (v1)

1. Open an EPUB on macOS in the forked reader.
2. Highlight a passage → **Ask** → receive an Antigravity answer in the chat panel.
3. Highlight → **Ask with library** → see citation chips and an answer that used injected LightRAG context.
4. Clear, actionable errors when `agy` or `lib-rag` is unavailable.

## Open implementation details (resolve in plan, not product undecided)

- Exact `lib-rag` HTTP route shape (new `/api/retrieve` vs extending viz server).
- Whether Antigravity multi-turn uses `--conversation` in v1 or full-context one-shots.
- Default token/char budgets for selection + library snippets.
