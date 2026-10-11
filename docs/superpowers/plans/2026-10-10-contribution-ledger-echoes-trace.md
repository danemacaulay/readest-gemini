# Contribution Ledger + Echoes Decision Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark Ask/Echoes notes with who contributed (`human` / `ai` / `co-authored`), and record Echoes retrieve decisions (kept/dropped sources, deferral) so the panel can show a Trace and soft-label weak connections.

**Architecture:** Local-only optional fields on `BookNote` and `EchoTrail` (no cloud transform changes). Pure helpers own contribution flip and score-split/deferral; Ask and Echoes write paths set `contribution: 'ai'`; human edits via the existing save hook flip `ai` → `co-authored`. UI is markers + Trace + "Possible ·" only.

**Tech Stack:** TypeScript, vitest, existing `updateBooknoteNoteText` / `useSaveBooknoteNoteText` / `runEchoes` / EchoesPanel / BooknoteItem.

**Spec:** `docs/superpowers/specs/2026-10-10-contribution-ledger-echoes-trace-design.md`

## Global Constraints

- Local-only: do **not** change `DBBookNote`, `transformBookNoteToDB`, or `transformBookNoteFromDB`.
- No validation / confirm / dispute UI or fields.
- Omit `contribution` ⇒ treat as human; do not migrate historical notes.
- Connections: confidence display only when a real number exists — never invent scores.
- Deferred retrieve: no agy call; toast *"Nothing in your library points this direction"*; existing `annotationIsNew` placeholder cleanup still runs.
- Constants: `ECHOES_MIN_RETRIEVE_SCORE = 0.3`, `ECHOES_LOW_CONNECTION_CONFIDENCE = 0.5`.
- Marker copy: `"AI"` / `"Co"` (short sidebar labels).
- i18n: user-visible strings via `_('...')` / existing stubTranslation patterns.
- E-ink: reuse `eink-bordered` / existing panel patterns; no shadow-only hierarchy.

## Review Focus

- Human edit of an Ask note must flip `ai` → `co-authored` even when only whitespace-normalized note text changes path runs — pin in `updateBooknoteNoteText` tests.
- Ask/Echoes save that **sets** `contribution: 'ai'` must not be treated as a human edit and flipped to `co-authored` — pin in save-path tests.
- Sources with **no** score stay in `retrieved` (not dropped) — pin in trace builder tests.
- All scores below threshold ⇒ defer (empty retrieved) even if the raw retrieve list was non-empty — pin in `runEchoes` tests.
- Legacy trails without `trace` hide the Trace section (no crash) — pin in EchoesPanel test.

---

## File map

| File | Responsibility |
|------|----------------|
| `types/book.ts` | `BookNoteContribution` + optional `contribution` on `BookNote` |
| `utils/booknoteContribution.ts` | `resolveContributionUpdate` pure helper |
| `utils/updateBooknoteNoteText.ts` | Optional `contribution` write + flip on human edit |
| `app/reader/hooks/useSaveBooknoteNoteText.ts` | Pass-through options to updater |
| `services/ai/ask/runAskForNote.ts` | `saveNote` accepts optional contribution meta |
| `Annotator.tsx` | Ask `saveNote` passes `{ contribution: 'ai' }` |
| `services/echoes/types.ts` | `score`, `confidence`, `EchoRetrieveTrace`, `trail.trace` |
| `services/echoes/constants.ts` | Min score + low-confidence constants |
| `services/echoes/buildRetrieveTrace.ts` | Split sources → trace; defer predicate |
| `services/echoes/runEchoes.ts` | Persist scores/trace; throw deferred; map connection confidence when available |
| `EchoesPanel.tsx` | Deferred toast; set contribution on note write; Trace UI |
| `sidebar/BooknoteItem.tsx` | AI / Co marker |
| `components/echoes/EchoConnectionList.tsx` | "Possible ·" prefix |
| Tests | Unit + component coverage listed per task |

---

### Task 1: Contribution field + note-text updater

**Files:**
- Modify: `apps/readest-app/src/types/book.ts` (`BookNote` interface ~199–224)
- Create: `apps/readest-app/src/utils/booknoteContribution.ts`
- Modify: `apps/readest-app/src/utils/updateBooknoteNoteText.ts`
- Modify: `apps/readest-app/src/__tests__/utils/updateBooknoteNoteText.test.ts`
- Create: `apps/readest-app/src/__tests__/utils/booknoteContribution.test.ts`

**Interfaces:**
- Consumes: `BookNote` from `@/types/book`
- Produces:
```ts
export type BookNoteContribution = 'human' | 'ai' | 'co-authored';

// on BookNote:
/** Local-only; cloud sync may drop this field. omit = human (legacy). */
contribution?: BookNoteContribution;

export function resolveContributionUpdate(
  existing: Pick<BookNote, 'contribution'>,
  options?: { contribution?: BookNoteContribution },
): BookNoteContribution | undefined;

// updateBooknoteNoteText(..., options?: { contribution?: BookNoteContribution })
```

- [ ] **Step 1: Write failing tests**

`booknoteContribution.test.ts`:
- `resolveContributionUpdate({ contribution: 'ai' }, { contribution: 'ai' })` ⇒ `'ai'`
- `resolveContributionUpdate({ contribution: 'ai' }, undefined)` ⇒ `'co-authored'`
- `resolveContributionUpdate({ contribution: 'co-authored' }, undefined)` ⇒ `'co-authored'`
- `resolveContributionUpdate({}, undefined)` ⇒ `undefined`

`updateBooknoteNoteText.test.ts` additions:
- options `{ contribution: 'ai' }` sets field on updated note
- no options + existing `contribution: 'ai'` ⇒ result `contribution: 'co-authored'`
- no options + no existing contribution ⇒ still unset

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @readest/readest-app test -- src/__tests__/utils/booknoteContribution.test.ts src/__tests__/utils/updateBooknoteNoteText.test.ts`

- [ ] **Step 3: Implement types + helper + updater options**

`resolveContributionUpdate`: if `options?.contribution` defined, return it; else if existing is `'ai'`, return `'co-authored'`; else return `existing.contribution`.

`updateBooknoteNoteText`: apply resolved contribution onto `updatedBooknote` (omit key when `undefined`).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/types/book.ts \
  apps/readest-app/src/utils/booknoteContribution.ts \
  apps/readest-app/src/utils/updateBooknoteNoteText.ts \
  apps/readest-app/src/__tests__/utils/booknoteContribution.test.ts \
  apps/readest-app/src/__tests__/utils/updateBooknoteNoteText.test.ts
git commit -m "$(cat <<'EOF'
feat(notes): local contribution field with ai→co-authored on edit

EOF
)"
```

---

### Task 2: Wire Ask + Echoes note saves to `contribution: 'ai'`

**Files:**
- Modify: `apps/readest-app/src/app/reader/hooks/useSaveBooknoteNoteText.ts`
- Modify: `apps/readest-app/src/services/ai/ask/runAskForNote.ts`
- Modify: `apps/readest-app/src/app/reader/components/annotator/Annotator.tsx` (Ask `saveNote` lambda ~1833)
- Modify: `apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx` (`saveBooknoteNoteText` after run ~157)
- Modify: `apps/readest-app/src/__tests__/ai/runAskForNote.test.ts`
- Modify: `apps/readest-app/src/__tests__/app/reader/components/notebook/EchoesPanel.test.tsx` (assert save called with contribution options if the panel calls an injectable saver; otherwise unit-test a thin wrapper — prefer extending the save hook mock expectations)

**Interfaces:**
- Consumes: Task 1 `updateBooknoteNoteText` options
- Produces:
```ts
// useSaveBooknoteNoteText return type becomes:
(booknoteId: string, noteText: string, options?: { contribution?: BookNoteContribution }) => Promise<boolean>

// AskForNoteDeps.saveNote:
(annotationId: string, note: string, options?: { contribution?: BookNoteContribution }) => Promise<boolean>
```

- [ ] **Step 1: Write failing tests**

`runAskForNote.test.ts`: on success, `saveNote` called with `'n1', 'Hello', { contribution: 'ai' }`.

EchoesPanel (or a focused unit around the success path): after successful `runEchoes`, save is invoked with `{ contribution: 'ai' }`.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @readest/readest-app test -- src/__tests__/ai/runAskForNote.test.ts src/__tests__/app/reader/components/notebook/EchoesPanel.test.tsx`

- [ ] **Step 3: Implement**

- Thread `options` through `useSaveBooknoteNoteText` into `updateBooknoteNoteText`.
- `runAskForNote`: `saveNote(target.id, result.answer, { contribution: 'ai' })`.
- Annotator Ask lambda: forward third arg.
- EchoesPanel success path: `saveBooknoteNoteText(noteId, next.synthesis, { contribution: 'ai' })`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/app/reader/hooks/useSaveBooknoteNoteText.ts \
  apps/readest-app/src/services/ai/ask/runAskForNote.ts \
  apps/readest-app/src/app/reader/components/annotator/Annotator.tsx \
  apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx \
  apps/readest-app/src/__tests__/ai/runAskForNote.test.ts \
  apps/readest-app/src/__tests__/app/reader/components/notebook/EchoesPanel.test.tsx
git commit -m "$(cat <<'EOF'
feat(ai): mark Ask and Echoes note writes as ai contribution

EOF
)"
```

---

### Task 3: Retrieve trace builder + deferral

**Files:**
- Create: `apps/readest-app/src/services/echoes/constants.ts`
- Create: `apps/readest-app/src/services/echoes/buildRetrieveTrace.ts`
- Modify: `apps/readest-app/src/services/echoes/types.ts`
- Create: `apps/readest-app/src/__tests__/echoes/buildRetrieveTrace.test.ts`

**Interfaces:**
- Consumes: `LightRAGSource` (or minimal `{ id, title?, score?, bookTitle? }`)
- Produces:
```ts
export const ECHOES_MIN_RETRIEVE_SCORE = 0.3;
export const ECHOES_LOW_CONNECTION_CONFIDENCE = 0.5;

export type EchoRetrieveTraceEntry = {
  id: string;
  title?: string;
  score?: number;
  bookTitle?: string;
};

export type EchoRetrieveTrace = {
  query: string;
  retrieved: EchoRetrieveTraceEntry[];
  dropped: (EchoRetrieveTraceEntry & { reason: 'below_threshold' })[];
  deferred: boolean;
  minScore: number;
};

// on EchoSource: score?: number
// on EchoConnection: confidence?: number
// on EchoTrail: trace?: EchoRetrieveTrace

export function buildEchoesRetrieveTrace(
  query: string,
  sources: ReadonlyArray<{ id: string; title?: string; score?: number; bookTitle?: string }>,
  minScore?: number, // default ECHOES_MIN_RETRIEVE_SCORE
): EchoRetrieveTrace;

export function isEchoesRetrieveDeferred(trace: EchoRetrieveTrace): boolean;
// true iff trace.retrieved.length === 0
```

Split rules (spec):
- `score >= minScore` → `retrieved`
- `score` present and `< minScore` → `dropped` with `reason: 'below_threshold'`
- `score` absent → `retrieved`
- `deferred: retrieved.length === 0`

- [ ] **Step 1: Write failing tests** in `buildRetrieveTrace.test.ts` covering: keep unscored; drop below; keep at/above; all-below ⇒ deferred true; empty input ⇒ deferred true; `minScore` recorded on trace.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @readest/readest-app test -- src/__tests__/echoes/buildRetrieveTrace.test.ts`

- [ ] **Step 3: Implement types + constants + `buildEchoesRetrieveTrace` / `isEchoesRetrieveDeferred`**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/echoes/constants.ts \
  apps/readest-app/src/services/echoes/buildRetrieveTrace.ts \
  apps/readest-app/src/services/echoes/types.ts \
  apps/readest-app/src/__tests__/echoes/buildRetrieveTrace.test.ts
git commit -m "$(cat <<'EOF'
feat(echoes): retrieve trace builder with score threshold deferral

EOF
)"
```

---

### Task 4: Integrate trace into `runEchoes`

**Files:**
- Modify: `apps/readest-app/src/services/echoes/runEchoes.ts` (`toEchoSources`, `runEchoes`)
- Modify: `apps/readest-app/src/__tests__/echoes/runEchoes.test.ts`
- Create: `apps/readest-app/src/services/echoes/EchoesDeferredError.ts` (or export class from `runEchoes.ts` if tiny — prefer small dedicated file)

**Interfaces:**
- Consumes: Task 3 `buildEchoesRetrieveTrace`, `isEchoesRetrieveDeferred`, constants
- Produces:
```ts
export class EchoesDeferredError extends Error {
  readonly code = 'echoes_deferred' as const;
  constructor(public readonly trace: EchoRetrieveTrace);
  // message: 'Nothing in your library points this direction'
}

// runEchoes: after retrieve, build trace from retrieveQuery(seed) + sources
// if deferred → throw EchoesDeferredError(trace) before complete/agy
// else upsert trail with trace; toEchoSources copies score; connections get confidence only if present on retrieve payload
```

- [ ] **Step 1: Write failing tests**

- Retrieve with only below-threshold scores ⇒ rejects with `EchoesDeferredError`, `complete` not called, store has no new trail.
- Happy path with scored source ⇒ trail has `trace.deferred === false`, `sources[0].score` preserved, `complete` called.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @readest/readest-app test -- src/__tests__/echoes/runEchoes.test.ts`

- [ ] **Step 3: Implement**

- `toEchoSources`: include `score: s.score` when defined.
- Connections map: pass through `confidence` only if the LightRAG connection object already has a numeric confidence/score field; otherwise leave unset (do not invent).
- Defer before `buildEchoesPrompt` / `complete`.

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/echoes/runEchoes.ts \
  apps/readest-app/src/services/echoes/EchoesDeferredError.ts \
  apps/readest-app/src/__tests__/echoes/runEchoes.test.ts
git commit -m "$(cat <<'EOF'
feat(echoes): persist retrieve trace and defer empty retrievals

EOF
)"
```

---

### Task 5: EchoesPanel deferred toast + Trace UI; connection "Possible"

**Files:**
- Modify: `apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx`
- Modify: `apps/readest-app/src/components/echoes/EchoConnectionList.tsx`
- Modify: `apps/readest-app/src/__tests__/app/reader/components/notebook/EchoesPanel.test.tsx`
- Create or Modify: `apps/readest-app/src/__tests__/components/echoes/EchoConnectionList.test.tsx`

**Interfaces:**
- Consumes: `EchoesDeferredError`, `ECHOES_LOW_CONNECTION_CONFIDENCE`, `trail.trace`
- Produces: UI only

Behavior:
- Catch `EchoesDeferredError`: info toast with `_('Nothing in your library points this direction')`; still run `annotationIsNew` cleanup; do not set error string as a hard failure (or set a soft message — prefer toast-only + empty state).
- When `trail.trace` present: collapsible Trace under Sources (details/summary or button toggle). Show query; retrieved rows with optional score; dropped count/list; if `deferred`, show deferred copy (normally deferred trails are not shown — still handle if loaded).
- Legacy trail without `trace`: hide Trace section.
- `EchoConnectionList`: if `confidence` defined and `< ECHOES_LOW_CONNECTION_CONFIDENCE`, prefix label with `_('Possible')` + ` · `.

- [ ] **Step 1: Write failing tests** for deferred toast path; Trace renders when `trace` present / hidden when absent; Possible prefix when `confidence: 0.2`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement UI**

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx \
  apps/readest-app/src/components/echoes/EchoConnectionList.tsx \
  apps/readest-app/src/__tests__/app/reader/components/notebook/EchoesPanel.test.tsx \
  apps/readest-app/src/__tests__/components/echoes/EchoConnectionList.test.tsx
git commit -m "$(cat <<'EOF'
feat(echoes): show retrieve trace and soft-label low-confidence links

EOF
)"
```

---

### Task 6: BooknoteItem contribution marker

**Files:**
- Modify: `apps/readest-app/src/app/reader/components/sidebar/BooknoteItem.tsx`
- Modify: `apps/readest-app/src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx`

**Interfaces:**
- Consumes: `item.contribution`
- Produces: small text marker before/above note body: `_('AI')` when `ai`, `_('Co')` when `co-authored`; nothing when unset/human.

- [ ] **Step 1: Write failing tests** — render with `contribution: 'ai'` shows AI; `'co-authored'` shows Co; unset shows neither.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement marker** (compact `text-xs opacity-70` near note body; no dimming)

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/app/reader/components/sidebar/BooknoteItem.tsx \
  apps/readest-app/src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx
git commit -m "$(cat <<'EOF'
feat(notes): show AI/Co contribution marker in annotations list

EOF
)"
```

---

### Task 7: Full suite smoke

- [ ] **Step 1:** Run `pnpm --filter @readest/readest-app test` — expect PASS (or only pre-existing failures unrelated to these files).
- [ ] **Step 2:** Run `pnpm --filter @readest/readest-app lint` on touched paths if practical.
- [ ] **Step 3:** No commit unless fixes needed; if fixes, commit `test: stabilize contribution/trace suite`.
