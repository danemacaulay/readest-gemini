# Design: Notebook Meta-Will (Active Reading Frame)

**Date:** 2026-10-10  
**Status:** Approved  
**Repo:** `reader` (soft-fork Readest)  
**Source idea:** Levin-analysis thread on *meta-will* and active personalization (Smart Learning): the reader sets a reading intention (“I’m reading this for X”); that intention is the deictic anchor (with-whom and whereto). Active personalization = the reader chooses; passive = the system adapts from history. Also addresses the open question whether navigation is about the world or the conversation — intention frames both.  
**Listed as non-goal in:** `2026-10-10-contribution-ledger-echoes-trace-design.md` (“Meta-will / reading intentions”). This design is that next step.  
**Brainstorm mockup:** `.superpowers/brainstorm/standalone-layout-and-link.html` (linking A+B approved; existing Notebook tab approved).

## Problem

Reading with Ask/Echoes can stay passive: the agent adapts from the passage or library graph, but the reader never declares *why this book, now*. There is no book-level place that (a) holds that intention, (b) closes the loop with a structured reflection after reading, and (c) can later steer Echoes when the reader has chosen a frame. The notebook already exists as a freeform book-scoped doc (“Start writing about this book…”), but it has no shared shape and no link back into the annotation trail.

## Goals

1. **Book meta note in the existing Notebook.** Soft-seed a fixed five-section template into the current notebook document (Notes tab of the right notebook). No prompts, no blockers, no forced open-on-book-start. The reader fills sections when they want.
2. **Link annotations into sections.** While composing, the reader can attach existing book notes as receipt chips under a section via (A) a chapter-grouped dropdown and (B) clicking a note in the left Annotate/Notes sidebar when a section is focused.
3. **Echoes respects intention when present.** If **Why I read it** has non-empty text, Echoes uses it to tilt retrieve/ranking (and may include it in synthesis framing). If empty, Echoes behaves exactly as today.
4. **Move Echoes to the left sidebar.** Echoes leaves the right notebook tab strip and becomes a tab on the left sidebar alongside TOC / Annotate / Bookmarks (and Chat when AI is on). Right notebook keeps Notes + AI.

## Non-goals

- Binding Ask prompts to intention in v1 (Ask stays unchanged).
- Indexing the notebook / reflection into LightRAG (“index the reader”) in v1 — durable content only; experiment later.
- A separate Meta entity, Meta tab, or new `BookNote` type for the frame.
- Forced onboarding, modal, or “set intention before reading” gate.
- Cloud sync schema changes beyond whatever the notebook string already syncs as today.
- Essay drafting UI (the notebook is stockpile for later writing, not a draft tool yet).
- Migrating or rewriting non-empty notebooks that already have freeform content (do not clobber).

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Home surface | Existing notebook `BookNote` (`id: 'notebook'`, Notes tab) | User confirmed; screenshot of current Notebook; avoids a second book-level doc |
| Template | Five fixed sections seeded into that doc | Approved in brainstorm |
| Forcing | None — template lives there; fill anytime | User: “no need to force anything” |
| Linking | A+B: chapter dropdown + left-Notes click-to-append | Approved click on mockup |
| Path B on mobile | Desktop-only; mobile uses dropdown (A) only | Opening Annotate closes notebook on mobile — two-panel focus+click is impossible |
| Chip placement | Under the active / target section | Receipts stay with the claim |
| Echoes chrome | Move from right notebook tabs → left sidebar tab | Clears right column for compose; Echoes is browse/retrieve |
| Ask | Out of scope for v1 | Intention is weaker for Ask; Echoes has clear ranking job |
| Empty intention | No Echoes behavior change | Soft personalization only when chosen |
| Indexing | Not in v1 | Build the practice first; LightRAG later |

## Sections (fixed shape)

| Section | Role |
| --- | --- |
| **Why I read it** | Opening intention / meta-will. Steers Echoes when non-empty. |
| **What shifted** | Belief, question, or taste that changed — not a book summary. |
| **What I take** | Claims, moves, or moments to reuse (essay stockpile). Links especially useful here. |
| **What I refuse** | Reject, resist, or put aside (broader than “disagree”). |
| **Still open** | Unresolved questions / tensions to argue later. |

No separate “general thoughts” junk drawer in v1; freeform prose can still live between or under sections inside the same editor if the reader types it. **Builder call:** exact empty-state copy and heading labels (i18n keys).

## Data model

### Notebook body

Keep storing the notebook as the existing string on `BookNote.note` (`NOTEBOOK_ID`). Prefer a representation that:

1. Shows the five sections in the Notes-tab editor without requiring a second document.
2. Can attach zero or more **note links** (annotation ids) to a section.
3. Survives round-trip save via the current notebook coordinator / size limit (`NOTEBOOK_MAX_BYTES`).

**Recommended approach (builder may refine):**

- Persist a small structured payload *alongside* or *inside* the notebook record so sections and links are not fragile markdown scraping alone.
- **Builder call on storage shape** — pick one and stick to it:
  - **A (preferred):** extend the notebook `BookNote` with a local-only field, e.g. `metaWill?: { sections: MetaWillSection[] }`, while the editor still shows a composed view; OR
  - **B:** encode sections + link markers in the notebook markdown/HTML the `TextEditor` already edits, with a strict parse/serialize helper.

Whatever is chosen must not break existing freeform notebooks: if the notebook already has non-empty content that is not a meta-will template, **do not overwrite**. Seed only when content is empty (first open / new notebook).

```ts
export type MetaWillSectionId =
  | 'why'
  | 'shifted'
  | 'take'
  | 'refuse'
  | 'open';

export type MetaWillNoteLink = {
  booknoteId: string;
  /** Snapshot for display if the source note is later deleted. */
  excerpt?: string;
  chapterLabel?: string;
};

export type MetaWillSection = {
  id: MetaWillSectionId;
  text: string;
  links: MetaWillNoteLink[];
};
```

Sync stance: same as other local-only enrichment fields if using option A (`contribution`, `askRegisters`) — cloud may drop unknown keys; do not require `DBBookNote` changes in v1. If using option B, links ride inside the synced string (weaker structure, broader sync).

### Extracting intention for Echoes

Pure helper, e.g. `getReadingIntention(notebook): string | null` — returns trimmed **Why I read it** text, or `null` if missing/empty. Echoes calls this for the open book’s notebook; no intention ⇒ current path unchanged.

## UX

### Notebook (right)

- Notes tab remains the compose surface.
- Empty notebook → seed five section headings (and empty bodies) once.
- Non-empty legacy notebook → leave content as-is; optional later “Insert reading frame” is **out of scope** unless cheap (builder may add a single quiet affordance if it fits without a modal).
- Each section shows a **Link note** control → chapter-grouped dropdown of this book’s annotations (exclude the notebook record itself). Selecting appends a chip under that section.
- **Desktop only:** Focused section + click on a note in the **left Annotate tab** also appends a chip to the focused section. If no section is focused, left-click keeps today’s navigate/select behavior (do not steal clicks). On mobile / single-panel layouts where opening Annotate closes the notebook, path B is unavailable — use the chapter dropdown only.
- Chip: short excerpt + chapter label; tap navigates to the annotation in-book (reuse existing open-annotation paths). Remove chip without deleting the source note.

### Left sidebar

- Add **Echoes** tab (icon already exists).
- Move the current `EchoesPanel` (or equivalent) from the right notebook into this tab.
- Remove `echoes` from `NotebookTab` / right bottom tabs so right is Notes + AI only (AI still gated on settings).

### Echoes behavior

When intention is non-empty for the seed book:

1. Include it in the retrieve query framing (so LightRAG neighborhood tilts toward the reader’s “whereto”).
2. Include a short “Reader intention: …” line in the synthesis prompt.
3. **Builder call:** whether client-side re-rank of connections by lexical/embedding overlap with intention is worth it in v1, or query+prompt injection is enough. Prefer the smaller change that still shows a clear difference when intention is set.

When intention is empty: bit-identical path to today (no extra prompt lines, no ranking changes).

## Flows

```
Open book → open Notebook Notes tab
  → if notebook empty: seed five sections
  → reader may fill "Why I read it" anytime (or never)

Run Echoes on a passage
  → if why non-empty: tilt retrieve + prompt
  → else: unchanged

Compose reflection
  → focus "What I take" → Link note dropdown OR click left Annotate note
  → chip appears under section; chip jump-navigates to highlight
```

## Anti-goals (failure even if it “works”)

- Forcing a modal before reading.
- Clobbering an existing freeform notebook.
- Making Ask feel personalized while ignoring Echoes (wrong layer).
- Link UX that only works via `@` mentions on e-ink/touch.
- Treating the template as AI-authored content (`contribution` stays human; this is the reader’s frame).

## Testing (intent)

- Empty notebook seeds once; second open does not duplicate sections.
- Non-empty legacy notebook unchanged.
- Link via dropdown always; left-sidebar click appends on desktop when a section is focused; no focus ⇒ no steal; mobile never steals Annotate clicks for linking.
- Chip remove does not delete source annotation.
- Echoes with empty why ≡ baseline; with why set, query/prompt includes intention (unit/integration on helpers + prompt builder).
- Left sidebar shows Echoes; right notebook tabs no longer include Echoes.

## What’s left to the builder

- Exact storage shape (structured field vs encoded editor content) within the constraints above.
- Section heading strings / i18n.
- Whether v1 needs client re-rank beyond query+prompt injection.
- Visual polish of chips and section chrome inside `TextEditor` / notebook layout, following `DESIGN.md` and e-ink rules.
- Implementation plan via `writing-plans` after this design is approved.

## Out of scope follow-ups (documented, not built)

- Index reader notebook + notes into LightRAG so Echoes can say “you argued the opposite in book Y.”
- Ask prompt binding to intention.
- Essay export / draft-from-meta-note.
- Fiction-tuned section labels.
