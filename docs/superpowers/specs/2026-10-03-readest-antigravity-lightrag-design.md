# Design: Readest + Antigravity + LightRAG Reader

**Date:** 2026-10-03  
**Status:** Implemented (automated tests + lib-rag smoke; manual macOS Ask/follow-up/history checklist pending).  
**Repo:** `reader` (greenfield; soft-fork of [Readest](https://github.com/readest/readest))

## Goal

A macOS EPUB/PDF reader based on a soft-fork of Readest where the user can highlight text and ask questions. Answers come from **Antigravity CLI** (`agy`) using the user’s Google / AI credits subscription. Optionally, the user can ground a question in their existing **`lib-rag` LightRAG** index; retrieved sources appear as citation chips and are injected into the model prompt. Past questions and answers persist locally in a **global, searchable history** so the user can revisit them and jump back to the source book.

## Non-goals (v1)

- Readest’s built-in Reedy / book-local RAG
- Rich LightRAG graph visualization in the reader
- Web, Windows, Linux, or mobile targets
- Replacing or removing Readest’s upstream AI providers for all users (Antigravity is the default happy path)
- Cross-device / cloud sync of AI conversations (local persistence only)
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
| Q&A persistence | Local global history, searchable across books, with jump-to-book |
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
| HistoryStore | Persist threads/messages locally; global search; open book + restore thread | Tauri/app local DB or Readest storage layer |
| History UI | Global “Questions” / history view: search, filter by book, open entry | HistoryStore, reader navigation |

### Antigravity invocation (v1)

- Prefer headless: `agy -p "<prompt>" --output-format stream-json` (aliases `--print` / `--prompt`).
- Use cached interactive login (user signs in once via `agy`); do not hang waiting for browser auth from the reader.
- Lock down tool permissions / sandbox so Ask flows are answer-oriented and do not roam or edit the filesystem by default.
- **Multi-turn threads:** On the first turn, parse `conversation_id` from the final `result` event and store it on the `QAThread`. Follow-ups in that thread call `agy -p "<follow-up>" --conversation <id> --output-format stream-json` so Antigravity keeps prior context. A new highlight **Ask** / **Ask with library** starts a **new** conversation (new thread).
- Do not use global `--continue` (most-recent-only); always bind resume to the thread’s stored id.
- Optional later optimization: long-lived `--input-format stream-json` process for lower latency; not required for v1 correctness.

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

## Persistence (Q&A history)

### Product behavior

- Every **Ask** / **Ask with library** turn is saved locally when the assistant reply completes (or when an error turn is finalized).
- History is **global across books**, not siloed to the open book only.
- A dedicated history view lists recent threads with title/snippet, book, timestamp, and whether library grounding was used.
- **Search** matches question text, answer text, and book title.
- Opening a history entry **jumps to the book** (and passage when CFI/location is available) and restores that thread in the chat panel.
- While reading a book, the chat panel can still show the active thread for that book; global history is the cross-library index.

### Data model (v1)

```ts
type QAThread = {
  id: string;
  bookHash: string;
  bookTitle: string;
  title: string;          // derived from first question
  createdAt: number;
  updatedAt: number;
  grounded: boolean;      // any turn used LightRAG
  selectionCfi?: string;  // best-effort anchor for jump-back
  agyConversationId?: string; // Antigravity conversation for follow-ups
};

type QAMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  createdAt: number;
  selectionText?: string;
  sources?: LightRAGSource[];  // chips for grounded turns
};
```

### Storage

- Local-only on macOS (SQLite or whatever persistence Readest already uses for AI conversations — prefer extending upstream types over a parallel store).
- No cloud sync in v1.
- Deleting a thread removes its messages; clearing history is explicit and confirm-gated.

## Data flow

### Ask (selection only)

1. User highlights text → **Ask** (enters / confirms question).
2. PromptBuilder packs book metadata + selection (+ location/CFI) + question.
3. AntigravityProvider runs headless `agy` and streams the reply into the chat panel.
4. No source chips.
5. HistoryStore writes/updates the thread + messages when the turn finishes, including `agyConversationId` from the `result` event.

### Ask with library

1. User highlights text → **Ask with library**.
2. LightRAGClient queries `lib-rag` using question + selection.
3. Ranked sources returned; PromptBuilder injects a capped “Library context” block and instructs the model to refer to source ids.
4. Antigravity completes as in Ask (new conversation).
5. Chat shows source chips under the assistant turn (from the retrieve step).
6. HistoryStore persists the turn including `sources` and `agyConversationId`.

### Follow-up in an open thread

1. User types a follow-up in the chat panel (no new highlight required).
2. Reader calls `agy -p "<follow-up>" --conversation <thread.agyConversationId>` — no full PromptBuilder rebuild; Antigravity holds prior turns.
3. LightRAG is **not** auto-queried on follow-ups. To ground again, user starts a new **Ask with library** (or a later explicit “ground this turn” action if added).
4. If `agyConversationId` is missing or resume fails, fall back to one-shot with reconstructed prompt from stored messages and start a new conversation id.
5. Append user + assistant messages to the same thread in HistoryStore.

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
| History write failure | Show non-blocking warning; do not fail the visible answer |
| Book missing on jump-back | Open history entry in read-only transcript view; explain book file not found |
| Follow-up `--conversation` resume fails | Rebuild one-shot from stored thread messages; save new `agyConversationId` |

Never silently claim library grounding succeeded when retrieval failed.

## Testing

- **Unit:** PromptBuilder packing/truncation; LightRAGClient → chip mapping; Antigravity `stream-json` / stdout parser; HistoryStore search/index helpers.
- **Integration (local):** mocked `agy` binary + mocked lib-rag HTTP; both selection actions; persist → search → reopen thread.
- **Manual (macOS):** real EPUB Ask; follow-up in-thread; Ask with library against the live index; missing-auth and server-down paths; global history search and jump-to-book.
- Live Antigravity credit calls are optional smoke tests, not CI-blocking.

## License and fork notes

- Upstream Readest is **AGPL-3.0**. This soft-fork inherits AGPL obligations for distributed builds.
- Prefer additive modules (provider, client, selection actions, settings) over deep rewrites of foliate/PDF pipelines.
- Track upstream Readest periodically; keep AI/LightRAG changes in clearly named modules to reduce merge pain.

## Success criteria (v1)

1. Open an EPUB on macOS in the forked reader.
2. Highlight a passage → **Ask** → receive an Antigravity answer in the chat panel.
3. Ask a follow-up in the same thread → answer uses prior conversation context via `--conversation`.
4. Highlight → **Ask with library** → see citation chips and an answer that used injected LightRAG context.
5. Reopen the app later, find that Q&A via global search, and jump back to the book/thread.
6. Clear, actionable errors when `agy` or `lib-rag` is unavailable.

## Open implementation details (resolve in plan, not product undecided)

- Exact `lib-rag` HTTP route shape (new `/api/retrieve` vs extending viz server).
- Default token/char budgets for selection + library snippets.
- Concrete storage backend (extend Readest AI conversation tables vs new HistoryStore schema).
- Full-text search implementation (SQLite FTS vs in-memory filter for early v1).
- Whether a long-lived `stream-json` stdin session is worth adding after `--conversation` works.
