# Design: Selection Ask → Auto-Note

**Date:** 2026-10-04  
**Status:** Approved for planning  
**Repo:** `reader` (soft-fork Readest)

## Problem

Selection **Ask** used to open a chat panel (`AskComposer` → `AskPanel`). The toolbar Ask actions were later retired in favor of Find Echoes, but the Ask stack (`askService`, `AskComposer`, history) still exists. The desired product is: highlight a passage, ask a question, and have the answer land on the document as a **note** — the same persisted booknote Annotate / Write Note creates — without a chat panel.

## Goals

- Restore **Ask** (ungrounded only) on the selection toolbar
- Collect a question via existing **AskComposer**
- Run Ask headlessly (`mode: 'ask'`) after dismiss
- On success: create/update the highlight like Annotate and write the note body
- Note body = **assistant answer + short citation line** (book title, page when known)
- Progress UX = **silent**: dismiss selection UI; toast when the note lands (or on error)

## Non-goals

- Restoring **Ask with library** on the toolbar
- Streaming / chat panel UI for this path
- Follow-up turns in a thread
- Prefilling the Annotate editor for user edit-before-save
- Changing Find Echoes behavior
- Cross-device sync of Ask history beyond what already exists

## Product flow

```
Select text → Ask (toolbar)
  → AskComposer (question)
  → Dismiss selection + composer
  → Background runAsk(mode: 'ask')
  → Success: highlight + note + toast
  → Failure: error toast, no note
```

### Note body format

```
{assistant answer}

— {book title}{, p.{page}}
```

- Blank line between answer and citation
- Omit `, p.{page}` when page is unknown / zero
- Do not include the user’s question or LightRAG sources (ungrounded Ask has none)
- Soft-trim trailing whitespace on the answer before formatting

### Guards (match Annotate)

- Disabled / no-op when selection lacks an anchorable CFI (e.g. popup-only selection without CFI)
- Same highlight creation semantics as Annotate’s `handleHighlight(true)` + note save via `saveBooknoteNoteText` / equivalent update of `booknote.note`
- If a highlight already exists at that CFI, reuse it and set/overwrite its `note` with the Ask result (same as saving a note on an existing annotation)

### Concurrent Asks

- Allow only one in-flight selection Ask per book view; a second submit while running shows a short “Ask already in progress” toast and does not start another run
- Capture selection text, CFI, book title, and page at submit time so later navigation does not corrupt the save target

## Architecture

```
Annotator (toolbar 'ask')
  → AskComposer
  → headless runner (new thin helper or Annotator handler)
       → runAsk({ mode: 'ask', … }, AskDeps)
       → formatAskNoteBody(answer, { bookTitle, page })
       → ensure highlight (Annotate path) + saveBooknoteNoteText
       → toast
```

| Unit | Responsibility |
|---|---|
| Toolbar / types | Re-add `ask` to `AnnotationToolType`, tool buttons, defaults (optional in Available tray or default toolbar — **default: include Ask next to Annotate**) |
| `annotationToolbar` sanitize | Stop mapping retired `ask` → Find Echoes; keep mapping `ask-with-library` → Find Echoes |
| AskComposer | Unchanged question UI |
| Headless Ask handler | Wire deps, call `runAsk`, format note, save, toast; no `AskPanel` |
| Note formatter | Pure `formatAskNoteBody` (unit-tested) |
| History (optional keep) | Best-effort persist Q+A to existing Ask history store so Questions search still works; failure to persist history must not block note save |

`AskPanel` remains in the codebase for history restore / any residual callers, but selection Ask no longer opens it.

## Settings / toolbar

- `ask` is a first-class tool again in `ALL_ANNOTATION_TOOL_TYPES` and `annotationToolButtons`
- Default toolbar includes `ask` (near `annotate`)
- Persisted configs that still list `ask-with-library` continue to sanitize that slot to `find-echoes`
- Persisted configs that list `ask` keep Ask (no longer rewritten to Echoes)

## Errors

| Case | UX |
|---|---|
| agy missing / auth / timeout / non-zero exit | Error toast; no note |
| Book config / note save failure | Error toast (reuse Annotate save failure copy where possible) |
| Ask already in flight | Info toast; ignore new submit |
| No CFI | Toolbar Ask disabled (same as Annotate) |

## Testing

- Unit: `formatAskNoteBody` (with/without page; trims answer)
- Unit: toolbar sanitize — `ask` kept; `ask-with-library` → `find-echoes`
- Component/integration: Ask submit path creates highlight + note with expected body (mock `runAsk`)
- No requirement for E2E against live `agy` in this change

## Decisions (locked)

1. Auto-save note (no editor)  
2. Note = answer + short citation  
3. Silent wait + toast  
4. Ask only (not Ask with library)  
5. Approach A — headless Ask → Annotate save path  
