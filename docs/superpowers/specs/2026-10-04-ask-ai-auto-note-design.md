# Design: Selection Ask → Auto-Note (+ Ask stack cleanup)

**Date:** 2026-10-04  
**Status:** Approved for planning (revised)  
**Repo:** `reader` (soft-fork Readest)

## Problem

Selection **Ask** used to open a chat panel and optionally ground in the library (**Ask with library**), with a global **Questions** history. Library grounding is now owned by **Find Echoes**. Notes already persist on the book. The desired product is a thin selection path: ask about a passage, get an answer written onto that highlight as a note — and remove the old Ask chat / history / library-grounding stack.

## Product consolidation

| Surface | Job |
|---|---|
| **Find Echoes** | Library-grounded discovery (LightRAG + synthesis); own UI + `echoes.json` persistence |
| **Ask** (selection) | Passage Q&A → auto-saved booknote on the highlight |
| **Annotate** | Manual note on a highlight |
| **Notebook AI** | Book-scoped chat (unchanged; keeps shared `agy` client) |

No global Ask history. No Ask with library. No Ask chat panel.

## Goals

- Restore **Ask** (ungrounded only) on the selection toolbar
- Collect a question via **AskComposer**
- Run Ask headlessly after dismiss
- On success: create/update the highlight like Annotate and write the note body
- Note body = **assistant answer only** (highlight already anchors the passage; no citation footer)
- Progress UX = **silent**: dismiss selection UI; toast when the note lands (or on error)
- **Delete** the old Ask panel, Ask-with-library mode, Questions history UI/store, and related tests

## Non-goals

- Restoring Ask with library (Echoes owns library grounding)
- Streaming / chat panel for selection Ask
- Follow-up turns
- Prefilling the Annotate editor
- Changing Echoes behavior beyond toolbar coexistence
- Migrating or importing `ask-history.json` into notes

## Product flow

```
Select text → Ask (toolbar)
  → AskComposer (question)
  → Dismiss selection + composer
  → Background ungrounded Ask (agy)
  → Success: highlight + note + toast
  → Failure: error toast, no note
```

### Note body format

```
{assistant answer}
```

- Soft-trim trailing whitespace on the answer
- Do not include the user’s question, book title, page, or other citation footer — the booknote is already bound to the highlight/CFI

### Guards (match Annotate)

- Disabled / no-op when selection lacks an anchorable CFI (e.g. popup-only selection without CFI)
- Same highlight creation semantics as Annotate’s `handleHighlight(true)` + note save via `saveBooknoteNoteText` / equivalent update of `booknote.note`
- If a highlight already exists at that CFI, reuse it and set/overwrite its `note` with the Ask result

### Concurrent Asks

- One in-flight selection Ask per book view; a second submit while running shows “Ask already in progress” and does not start another run
- Capture selection text and CFI at submit time (book title still goes to the Ask prompt, not the note)

## Architecture

```
Annotator (toolbar 'ask')
  → AskComposer
  → headless runner
       → buildAskPrompt + completeWithAntigravity (ungrounded)
       → trim answer → ensure highlight + saveBooknoteNoteText
       → toast
```

| Unit | Responsibility |
|---|---|
| Toolbar / types | Re-add `ask` to `AnnotationToolType`, tool buttons; default toolbar includes Ask near Annotate |
| `annotationToolbar` sanitize | Drop `ask` from retired-tools rewrite; map legacy `ask-with-library` → `find-echoes` (migration only), then remove that tool from the type system |
| AskComposer | Question dialog only (`mode` prop removed or fixed to Ask) |
| Headless Ask helper | Thin wrapper over prompt + `agy`; no retrieve, no follow-up, no history |
| Shared `agy` plumbing | Keep `antigravityClient`, `runCommand`, `agyShell` — still used by Echoes, notebook chat, settings, indexing |

### Cleanup (delete)

| Remove | Why |
|---|---|
| `AskPanel.tsx`, `SourceChips.tsx`, `HistoryList.tsx` | Chat / grounding / history UI |
| `app/library/questions/` | Global Questions page |
| `services/ai/history/` (`historyStore`, types) | Ask history persistence (`ask-history.json`) |
| `ask-with-library` mode + retrieve branch in `askService` | Echoes owns library grounding |
| `runFollowUp` | No thread UI |
| AskPanel / history / follow-up / truncation-rebuild tests tied to deleted UI | Dead coverage |
| Nav / settings links to Questions (if any) | Dead entry points |

### Keep / slim

| Keep | Change |
|---|---|
| `AskComposer` | Selection question entry only |
| `askErrors` | Map agy failures → toast strings for headless Ask |
| `promptBuilder` | Ungrounded selection prompt only (drop library/context branches if unused) |
| `askService` | Collapse to ungrounded one-shot, or fold into a `runAskForNote` helper and delete the old multi-mode API |
| `antigravityClient` / `runCommand` / `agyShell` | Shared infra — do not delete |

Orphan on-disk `ask-history.json` may be left in place; no migration. Optional later: delete file on first launch — not required for this change.

## Settings / toolbar

- `ask` is first-class again in `ALL_ANNOTATION_TOOL_TYPES` and `annotationToolButtons`
- Default toolbar includes `ask` (near `annotate`) and `find-echoes`
- Persisted configs listing `ask-with-library` sanitize that slot to `find-echoes`
- Persisted configs listing `ask` keep Ask (no longer rewritten to Echoes)

## Errors

| Case | UX |
|---|---|
| agy missing / auth / timeout / non-zero exit | Error toast; no note |
| Book config / note save failure | Error toast (reuse Annotate save failure copy where possible) |
| Ask already in flight | Info toast; ignore new submit |
| No CFI | Toolbar Ask disabled (same as Annotate) |

## Testing

- Unit: toolbar sanitize — `ask` kept; `ask-with-library` → `find-echoes`
- Unit: ungrounded Ask helper (mock `complete`) returns trimmed answer; no retrieve call
- Component/integration: Ask submit creates highlight + note whose body is exactly the trimmed answer (mock completion)
- Confirm Questions route / history modules are gone (import/build fails if leftovers)
- No live `agy` E2E required for this change

## Decisions (locked)

1. Auto-save note (no editor)  
2. Note body = trimmed answer only (highlight is the citation)  
3. Silent wait + toast  
4. Ask only — library grounding is Echoes  
5. Approach A — headless Ask → Annotate save path  
6. **No Ask history** — notes are the persistence  
7. **Delete** old Ask panel, Ask-with-library, Questions UI/store  
