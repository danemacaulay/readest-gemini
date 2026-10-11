# Design: Contribution Ledger + Echoes Decision Trace

**Date:** 2026-10-10  
**Status:** Approved for planning  
**Repo:** `reader` (soft-fork Readest)  
**Approach:** A — fields on the render target; **local-only** (no cloud sync schema)

## Problem

Ask and Echoes write AI text onto the same `BookNote` surface as hand-written notes, with no record of who contributed. Echoes retrieve decisions (what was kept, dropped, or deferred) are also invisible. Per Levin: when construction is trivial the task is documenting contribution; orchestration outputs should carry a decision trace and treat uncertainty as a signal for deferral.

Validation of AI claims is out of scope — Echoes is a library surface, not something to endorse, and Ask validation can wait.

## Goals

1. **Contribution ledger** — every AI-touched note carries `contribution: 'human' | 'ai' | 'co-authored'`; editing an AI note flips it to `co-authored`. Applies to Ask and Echoes-written notes.
2. **Decision trace (Echoes)** — each Echoes trail stores a compact retrieve/defer trace (query, kept/dropped sources with scores, deferred flag); low-confidence connections show as possible; empty/below-threshold retrieve defers (no synthesis).

## Non-goals

- Validation / confirm / dispute on Ask notes, Echoes synthesis, or connections
- Cloud sync / `DBBookNote` / `transformBookNoteToDB` changes (local book config + `echoes.json` only)
- Dual text layers (separate reader vs AI note bodies)
- PARDES / epistemic-ecology multi-register Ask answers
- Indexing the reader's notes into LightRAG
- Meta-will / reading intentions
- Export formatting beyond preserving new fields in existing note export if it already dumps JSON/`BookNote` wholesale
- Migrating historical notes (omit `contribution` ⇒ treat as human)

## Data model

### `BookNote` (`types/book.ts`)

```ts
/** Local-only; cloud sync may drop this field. omit = human (legacy). */
contribution?: 'human' | 'ai' | 'co-authored';
```

### `EchoSource` / `EchoConnection` / `EchoTrail` (`services/echoes/types.ts`)

```ts
// EchoSource — persist score when LightRAG provides it
score?: number;

// EchoConnection — display-only confidence
confidence?: number; // 0–1 when derivable; else omit

// EchoTrail
trace?: {
  query: string;
  retrieved: { id: string; title?: string; score?: number; bookTitle?: string }[];
  dropped: {
    id: string;
    title?: string;
    score?: number;
    reason: 'below_threshold';
  }[];
  deferred: boolean;
  minScore: number;
};
```

### Write rules

| Event | Effect |
| --- | --- |
| Manual Annotate (new note) | leave `contribution` unset (human) |
| Ask succeeds | note `contribution: 'ai'` |
| Echoes writes synthesis into highlight note | note `contribution: 'ai'`; copy scores into `EchoSource.score` and `trace`; optional `confidence` on connections when derivable |
| Reader edits note text that was `ai` | → `co-authored` (idempotent if already) |
| Retrieve empty or all scores `< minScore` | `trace.deferred: true`, no agy call, toast; leave placeholder highlight removal to existing Echoes failure path |

### Resolution / defaults for consumers

| Field absent | Treat as |
| --- | --- |
| `contribution` | `human` |
| `score` / `confidence` | omit UI affordance (no fake number) |

### Persistence & sync

- Book fields: live on the in-config `BookNote` JSON (local `saveConfig` path).
- Trail fields: `echoes.json` via existing `echoStore`.
- **Do not** add columns to `DBBookNote` or change `transformBookNoteToDB` / `FromDB`. Cloud sync may drop `contribution` on round-trip; that is accepted for this pass. Document in code comment next to the new optional field.

## Product UI

### Annotations sidebar (`BooknoteItem`)

- Small text marker for `ai` / `co-authored` (e.g. "AI" / "Co"). Human: no marker.
- No validation chrome, no dimming by endorsement state.

### Echoes panel

- Connections: low `confidence` (below a single constant, e.g. 0.5) prefixed "Possible ·".
- Collapsible **Trace** under sources: query, kept list with scores, dropped count/list, or "Deferred — nothing above threshold" when `deferred`.

### Threshold & deferral

- Single constant `ECHOES_MIN_RETRIEVE_SCORE` (plan picks value from observed LightRAG scores or a documented default such as `0.3`).
- Sources with score ≥ threshold → `retrieved`; with score present and below → `dropped`; sources with no score → keep in `retrieved` (do not invent scores).
- If `retrieved` is empty after filtering → defer: write nothing + toast *"Nothing in your library points this direction"*; do not call agy; existing `annotationIsNew` cleanup still applies.

## Data flow

```
Ask:
  ensureHighlight → agy → saveNote(text, { contribution: 'ai' })

Echoes:
  retrieve → build trace (split by minScore)
    → if deferred: toast + cleanup placeholder; stop
    → else agy → upsert trail (trace)
    → write note body + contribution: 'ai'

Edit note text:
  updateBooknoteNoteText + if contribution === 'ai' then contribution = 'co-authored'
```

## Errors

| Case | Behavior |
| --- | --- |
| Ask/Echoes AI failure | unchanged toasts; no contribution written (or placeholder removed) |
| Deferred retrieve | info toast; no synthesis; placeholder removed if `annotationIsNew` |
| Legacy trails without `trace` | Trace section hidden |

## Testing

- Unit: contribution flip on edit; Ask/Echoes write paths set `contribution: 'ai'`; score split into retrieved/dropped; defer when empty; defaults when fields omitted.
- Component: BooknoteItem AI/Co marker; EchoConnectionList "Possible" prefix; EchoesPanel Trace collapsed/expanded and deferred copy.
- No cloud sync tests for these fields.

## Open choices for the plan (not blockers)

- Exact `ECHOES_MIN_RETRIEVE_SCORE` default after checking sample LightRAG scores in tests/fixtures.
- Marker copy: "AI" / "Co" vs longer labels (prefer short for sidebar density).
