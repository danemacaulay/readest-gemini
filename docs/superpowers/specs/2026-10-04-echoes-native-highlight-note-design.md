# Design: Echoes → Native Highlight + Note

**Date:** 2026-10-04  
**Status:** Approved for planning  
**Repo:** `reader` (soft-fork Readest)

## Problem

Echoes currently keeps the seed quote in the Notebook Echoes panel (“Seed” section) and only attaches a lightweight `type: 'echo'` stub on promote. Ask already showed a better pattern: the passage is a real highlight, and the AI output is the note body. Echoes should follow that for the seed, while keeping library evidence (ideas, connections, sources) and the Library Echoes index.

## Goals

- On **Find Echoes**, create a normal highlight on the selected passage immediately
- When synthesis finishes, write the comparative take into that highlight’s **note** (no draft/promote stage)
- Drop the **Seed** section from Notebook → Echoes (quote lives on the highlight/note)
- Keep Notebook → Echoes for comparative take + ideas + connections + sources/references
- Keep **Library → Echoes** for cross-book trail browsing
- Keep `echoes.json` for trail/evidence metadata, linked to the native annotation
- **Selection-only entry:** remove Notebook Echoes “Ask across your library” composer; Find Echoes from a text selection is the only driver

## Non-goals

- Global “all notes” library page
- Removing Notebook → Echoes or Library → Echoes
- Free-text / no-selection Echoes runs (composer)
- Changing Open-source / open-other-book behavior beyond existing paths
- Migrating historical promoted stubs in this design (call out in plan if needed)

## Product flow

```
Select text → Find Echoes
  → Create highlight (Annotate-style) while selection is live
  → Dismiss selection; open Notebook → Echoes (finding…)
  → Retrieve + synthesize (as today)
  → Success: write synthesis into highlight note; trail saved (promoted/durable)
  → Failure: error toast; remove empty placeholder highlight
```

No Discard/Save trail for the seed quote — finishing the run *is* saving the note. Trail evidence remains durable in `echoes.json` for the Echoes panel and Library list.

## UI

### Notebook → Echoes

| Keep | Drop |
|---|---|
| Comparative take (optional mirror of note; or link-only — plan decides) | **Seed** section (quote / question block) |
| Ideas chips | Draft vs Saved trail chrome tied to promote |
| Connections | Promote / Discard as seed lifecycle (if unused) |
| Sources / references + Open | Composer “Ask across your library…” / Find |

**Drop** the Notebook Echoes composer (“Ask across your library…” / Find). Text selection → Find Echoes is the only way to start a trail (requires CFI).

### Library → Echoes

Unchanged role: list trails across books, open seed book (and preferably jump to CFI / open Echoes panel). Prefer linking via annotation id + CFI once the stub model softens.

### Reader

- Seed passage shows as a normal highlight with note bubble / Annotations list entry
- Sidebar Annotations lists it like any other note (searchable with other notes)

## Data model

| Layer | Role |
|---|---|
| `BookNote` annotation | Highlight + `note` = synthesis text; CFI anchors seed |
| `echoes.json` trail | `seed` still stores bookHash/cfi/seedText for retrieve/history; add `annotationId` (or reuse `noteId`) pointing at the BookNote |
| Echo stub `type: 'echo'` / `echo:<trailId>` | **Retire for new trails** — native annotation replaces the stub as the book-side pointer. Plan: either stop creating stubs, or make promote a no-op that only ensures annotation + trail link |

Failed Ask cleanup pattern: track newly created annotation ids; on failure call existing empty-placeholder removal.

## Errors

| Case | UX |
|---|---|
| No CFI | Find Echoes disabled (already) |
| Highlight create fails | Error toast; do not run retrieve |
| Retrieve / agy fails | Error toast; remove empty placeholder highlight |
| Note save fails after synthesis | Error toast; keep highlight; trail may still hold synthesis for retry (plan detail) |

## Testing

- Find Echoes creates highlight before await; dismisses selection
- Success writes synthesis to `booknote.note`
- Failure removes new empty highlight; does not delete pre-existing highlight at CFI
- EchoesPanel no longer renders Seed section
- Library Echoes still lists trails and opens book
- Sync/cascade: deleting the annotation cleans up or orphans trail per plan (must specify)

## Decisions (locked)

1. Highlight + note = synthesis (not highlight-only anchor)  
2. Write note as soon as Find Echoes finishes — **drop draft/promote for seed**  
3. Drop Seed UI from Echoes panel; keep ideas / connections / sources  
4. Keep Library → Echoes and `echoes.json` for evidence + cross-book list  
5. Follow Ask’s race-safe create-highlight-then-dismiss pattern  
6. **Selection-only** — no free-text “Ask across your library” composer  
