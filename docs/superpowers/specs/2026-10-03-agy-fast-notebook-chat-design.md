# Fast Antigravity Notebook Chat — Design

**Date:** 2026-10-03  
**Status:** Approved for planning

## Problem

Notebook chat via `agy` felt slow/stuck because prompts encouraged tool use (including filesystem search) and LightRAG retrieve. We want a useful reading assistant that stays fast by default, with intentional context only.

## Goals

- Fast, responsive notebook AI by default
- Useful book identity + metadata without expensive retrieval
- Allow web search when the model needs it
- Defer LightRAG to a later, UI-driven design

## Non-goals

- LightRAG / MCP / library retrieve on the chat path
- Citation chips
- Selection → chat bridge
- Migrating ask-history
- Major `@assistant-ui/react` upgrade

## Product behavior

### Default send

1. Short system rules (reading assistant; may use web search; never search local filesystem or open book files from disk; prefer direct answers; keep tool use light)
2. Book identity: title + author
3. **First turn of a conversation only:** capped metadata pack (~1500–2000 chars) from the open book’s already-loaded fields:
   - title, author, tags, series (+ index), publisher, published, subjects, truncated description
4. User message / short transcript as needed

### Follow-ups

- Resume with stored `agyConversationId` (`agy --conversation`)
- Do **not** resend the metadata pack
- Rules + latest user turn (or minimal transcript)

### Tools / flags

- Invoke: `agy -p … --output-format stream-json --sandbox --dangerously-skip-permissions`
- Web search: always available (agy’s `search_web`); encouraged only when useful
- No LightRAG curl/retrieve instructions in the prompt
- Sandbox retained to limit filesystem sprawl

### UI

- No metadata toggle (first-turn pack is automatic)
- No LightRAG / “use library” chip
- Existing composer running/stop affordances; buffer-then-emit answers are OK for v1
- Clear error strings for agy not-found / auth / timeout / exit

## Architecture

```
Composer → AntigravityChatAdapter
  → buildAntigravityPrompt(rules, optional first-turn metadata, messages)
  → completeWithAntigravity (sandbox + skipPermissions)
  → yield assistant text
  → persist agyConversationId on AIConversation
```

First turn detection: no `agyConversationId` on the active conversation (or empty message history before the send).

Metadata source: Readest open-book data (`book` / `book.metadata` / tags) — not a live `calibredb` call on each send.

## Error handling

| Failure | User-visible |
|--------|----------------|
| agy missing | Install / path message |
| Not authenticated | Run `agy` once to sign in |
| Timeout | Timed out waiting for response |
| Non-zero exit | Truncated stderr/stdout message |

Optional improvement: cancel/`abortSignal` kills the child `agy` process.

## Testing

- Unit: first-turn prompt includes capped metadata and web-search / no-filesystem rules; omits LightRAG
- Unit: resume/follow-up omits metadata pack; passes `--conversation`
- Manual: simple question returns quickly; no home-directory `find`; metadata can inform first answer

## Later (explicitly deferred)

Intentional LightRAG integration (UI-gated; likely app-side retrieve or a dedicated MCP) once product shape is clear.
