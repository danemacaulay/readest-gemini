# Echoes Native Highlight + Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find Echoes creates a real highlight immediately, writes the comparative synthesis into that note when the run finishes (no draft/promote), drops Seed UI and the library composer, and keeps Notebook evidence + Library Echoes via `echoes.json` linked by `annotationId`.

**Architecture:** Mirror Ask’s race-safe path in `handleFindEchoes`: create highlight while selection is live, pass `annotationId` on the seed, dismiss UI, run retrieve+synthesis. On success, `saveBooknoteNoteText(annotationId, synthesis)` and upsert the trail as durable (`status: 'promoted'`, `noteId`/`annotationId` = booknote id) **without** creating a `type: 'echo'` stub. On failure, remove empty placeholder highlight. EchoesPanel becomes evidence-only (no Seed, no composer, no Save/Discard). Library list + sync key off annotation id / trail durability instead of echo stubs for new trails.

**Tech Stack:** Readest Annotator/booknotes, `echoesUiStore`, `runEchoes` / `echoStore`, vitest.

## Global Constraints

- Selection-only entry (no “Ask across your library” composer).
- Highlight early; note body = synthesis when run finishes.
- No draft/promote lifecycle for new trails.
- Drop Seed section from EchoesPanel.
- Keep ideas / connections / sources + Library → Echoes.
- Retire `createEchoBookNoteStub` for **new** trails; historical stubs may remain until cascade.
- Follow Ask: create highlight before dismiss; remove only newly created empty highlights on failure.
- Deleting the annotation should delete/orphan the linked trail (cascade).

---

## File map

| File | Responsibility |
|------|----------------|
| `services/echoes/types.ts` | `EchoTrailSeed.annotationId?`; clarify `noteId` = BookNote annotation id |
| `store/echoesUiStore.ts` | Seed carries `annotationId` |
| `Annotator.tsx` | `handleFindEchoes` create highlight + pass annotationId + dismiss |
| `services/echoes/runEchoes.ts` | Upsert trail as promoted with annotationId; no draft-only path |
| `EchoesPanel.tsx` | Drop Seed, composer, Save/Discard; on success write note via save hook |
| `services/echoes/echoStore.ts` | Soften/stop promote stub creation for new flow |
| `services/echoes/echoSync.ts` | Resolve trails by annotation presence for new model |
| `sidebar/BooknoteItem.tsx` | Open Echoes when annotation id matches a trail; cascade delete trail |
| Tests | Annotator Find Echoes flow; EchoesPanel; runEchoes; sync |

---

### Task 1: Types + seed carries `annotationId`

**Files:**
- Modify: `apps/readest-app/src/services/echoes/types.ts`
- Modify: `apps/readest-app/src/__tests__/echoes/*.ts` as needed for type churn

**Interfaces:**
```ts
export type EchoTrailSeed = {
  bookHash: string;
  cfi?: string;
  seedText?: string;
  question?: string; // legacy; unused for new selection-only path
  bookTitle?: string;
  /** Native highlight BookNote id created at Find Echoes time. */
  annotationId?: string;
};
// EchoTrail.noteId === annotation BookNote.id for new trails
```

- [ ] **Step 1:** Add `annotationId?: string` to `EchoTrailSeed`; document that `noteId` on trail is the annotation id for new trails.
- [ ] **Step 2:** Run typecheck/tests that import types; fix compile breaks only.
- [ ] **Step 3:** Commit `feat(echoes): add annotationId to EchoTrailSeed`

---

### Task 2: Annotator Find Echoes creates highlight first

**Files:**
- Modify: `apps/readest-app/src/app/reader/components/annotator/Annotator.tsx`
- Create/Modify: `apps/readest-app/src/__tests__/components/annotator/AnnotatorFindEchoesFlow.test.tsx` (mirror AskNoteFlow mocks)

**Behavior (mirror `handleAsk`):**
1. Guard text + CFI; one in-flight optional (or rely on echoesUiStore isRunning)
2. Capture href; `created = handleHighlight(true)`; resolve `target`
3. If no target → toast error; return (do not requestEchoesRun)
4. `requestEchoesRun({ bookHash, bookTitle, seedText, cfi, annotationId: target.id })`
5. Open notebook Echoes tab; `handleDismissPopupAndSelection()`
6. Keep `askPlaceholderIds`-style list? For Echoes, failure cleanup happens in EchoesPanel — pass `annotationId` and whether it was newly created via seed flag `annotationCreated?: boolean` OR always treat annotationId as removable empty note if synthesis fails and note still empty.

Simpler: pass `annotationId` + `annotationIsNew: boolean` on seed (true when `created.length > 0`).

- [ ] **Step 1:** Write failing test: Find Echoes click → highlight in booknotes + `requestEchoesRun` called with `annotationId`.
- [ ] **Step 2:** Implement `handleFindEchoes`.
- [ ] **Step 3:** Tests pass; commit `feat(echoes): create highlight on Find Echoes before run`

---

### Task 3: runEchoes upserts durable trail with annotationId (no draft stub)

**Files:**
- Modify: `apps/readest-app/src/services/echoes/runEchoes.ts`
- Modify: `apps/readest-app/src/__tests__/echoes/runEchoes.test.ts`

**Behavior:**
- After successful synthesize, `upsert` trail with `status: 'promoted'`, `noteId: seed.annotationId`, seed including `annotationId`
- Do **not** call `promote()` / `createEchoBookNoteStub`
- Keep returning the trail for the panel

- [ ] **Step 1:** Update tests: expect `status: 'promoted'` and `noteId === annotationId`; assert no stub factory if mocked.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit `feat(echoes): persist trails as promoted with annotationId`

---

### Task 4: EchoesPanel — write note on success; strip Seed/composer/Save/Discard

**Files:**
- Modify: `apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx`
- Modify/Create: EchoesPanel tests if present

**Behavior:**
- Remove composer form + `handleComposerSubmit`
- Remove Seed section JSX
- Remove Discard + Save trail buttons (keep Continue in chat)
- Empty state copy: selection-only (“Select a passage and choose Find Echoes.”)
- On successful `runEchoes`: if `trail.noteId` or `pendingSeed.annotationId`, call `saveBooknoteNoteText(id, trail.synthesis)` (via `useSaveBooknoteNoteText(bookKey)`)
- On failure: if `annotationIsNew` and annotation still has empty note, remove placeholder (reuse Annotator’s `removeEmptyAnnotationPlaceholder` pattern — extract shared helper or duplicate minimal remove in panel via booknotes update)
- Prefer extracting a tiny `removeEmptyAnnotationPlaceholder` usage from annotatorUtil (already exists)

Wire failure cleanup in the same effect that runs `runEchoes` (catch block).

- [ ] **Step 1:** Tests or manual assertions for no Seed/composer; success saves note text.
- [ ] **Step 2:** Implement UI + save/cleanup.
- [ ] **Step 3:** Commit `feat(echoes): fill annotation note on finish; strip Seed and composer`

---

### Task 5: Sync + BooknoteItem — annotation-linked trails

**Files:**
- Modify: `apps/readest-app/src/services/echoes/echoSync.ts`
- Modify: `apps/readest-app/src/app/reader/components/sidebar/BooknoteItem.tsx`
- Modify: `apps/readest-app/src/__tests__/echoes/echoSync.test.ts`
- Modify: `apps/readest-app/src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx`

**Behavior:**
- `orphanedPromotedTrails`: for trails with `noteId`/`annotationId`, orphan if that BookNote is missing/tombstoned (not only `type: 'echo'` stubs). Keep stub logic for legacy trails with `echo:` refs.
- BooknoteItem: if `item.id` matches a trail’s `noteId`, treat as echo-linked for open → Notebook Echoes tab (in addition to legacy `type: 'echo'`). Cascade delete trail when annotation deleted (existing cascade path).
- Library echoes page: still list `status === 'promoted'` (all new trails are promoted).

- [ ] **Step 1:** Tests for orphan detection by annotation id; BooknoteItem opens echoes for annotation-linked note.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit `feat(echoes): link trails to native annotations for sync and sidebar`

---

### Task 6: Soft-retire promote stub path + cleanup verification

**Files:**
- Modify: `apps/readest-app/src/services/echoes/echoStore.ts` — `promote` unused by panel; leave for legacy or make it update status only without stub if still called
- Grep: remove dead Save/Discard/composer tests; update empty-state strings
- Run focused vitest suite; `pnpm install-macos`

- [ ] **Step 1:** Grep for `Ask across your library`, Seed heading, `handleSaveTrail`, `createEchoBookNoteStub` call sites from panel.
- [ ] **Step 2:** Fix leftovers; run tests.
- [ ] **Step 3:** Rebuild macOS app; commit any sweep fixes.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Highlight on Find Echoes | 2 |
| Synthesis → note on finish | 4 |
| Drop draft/promote | 3, 4 |
| Drop Seed UI | 4 |
| Drop composer | 4 |
| Keep evidence + Library Echoes | 4, 5 |
| annotationId link; no new stubs | 1, 3, 5 |
| Failure removes empty highlight | 4 |
| Cascade delete | 5 |

## Self-review notes

- Comparative take remains visible in EchoesPanel (mirror of note) so evidence context stays readable without hunting the bubble.
- Legacy `type: 'echo'` stubs and `echo:` refs still supported in sync/BooknoteItem until naturally deleted.
- Composer-only runs removed; any tests that drove Echoes via composer must switch to selection/Find Echoes.
