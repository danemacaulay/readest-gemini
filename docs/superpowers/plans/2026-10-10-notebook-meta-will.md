# Notebook Meta-Will Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft-seed a five-section reading frame into the existing book Notebook, link annotations in as chips (dropdown always; left-sidebar click on desktop), tilt Echoes when “Why I read it” is set, and move Echoes from the right notebook tabs to the left sidebar.

**Architecture:** Local-only `metaWill` on the notebook `BookNote` is the source of truth for sections and links. A structured `MetaWillEditor` replaces the freeform `TextEditor` when `metaWill` is present (or when seeding an empty notebook). Each save dual-writes a composed markdown `note` for sync/export and keeps the notebook document coordinator hydrated with that string. Echoes reads intention via a pure helper and injects it into retrieve query + synthesis prompt only when non-empty. Path B (click Annotate → append) is desktop-only.

**Tech Stack:** TypeScript, React, Zustand, vitest + testing-library, existing `BookNote` / notebook coordinator / Echoes / left sidebar tabs.

**Spec:** `docs/superpowers/specs/2026-10-10-notebook-meta-will-design.md`

All paths below are relative to `apps/readest-app/`. Run tests from that directory with `pnpm test -- <path>`.

## Global Constraints

- Local-only: do **not** change `DBBookNote`, `transformBookNoteToDB`, or `transformBookNoteFromDB`.
- Do **not** clobber a non-empty notebook that has no `metaWill` (legacy freeform stays on `TextEditor`).
- Seed only when notebook is missing or both `note` trimmed empty and `metaWill` absent.
- Ask prompts unchanged. No LightRAG indexing of the notebook.
- Path B (left Annotate click → append) only when desktop two-panel is available; mobile uses dropdown only.
- Empty “Why I read it” ⇒ Echoes bit-identical to today (no extra prompt line, no query suffix).
- Section ids canonical order: `why`, `shifted`, `take`, `refuse`, `open`.
- Heading labels (i18n keys = English source): `Why I read it`, `What shifted`, `What I take`, `What I refuse`, `Still open`.
- `contribution` stays human / unset for this reader-authored frame.
- E-ink: chips and Link note use `eink-bordered`; no color-only affordances.
- Minimum code: no “Insert reading frame” modal, no client embedding re-rank, no fiction-tuned labels.

## Review Focus

- Legacy notebook with freeform text and no `metaWill` must still open in `TextEditor` unchanged. (Task 2)
- Empty notebook seeds once; reopening does not duplicate sections. (Task 2)
- Mobile Annotate click must not append chips or steal navigation. (Task 4)
- Echoes with empty why must call retrieve with the same query string as today. (Task 5)
- Opening Find Echoes / echo stubs must open the **left** Echoes tab, not set a removed notebook `echoes` tab. (Task 6)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/types/book.ts` | `MetaWillSectionId`, `MetaWillNoteLink`, `MetaWillSection`, `MetaWill`, `BookNote.metaWill` |
| `src/utils/metaWill.ts` | Labels, seed factory, `getReadingIntention`, compose markdown, append/remove link, group notes by chapter |
| `src/app/reader/hooks/useSaveNotebookMetaWill.ts` | Debounced persist of `metaWill` + composed `note` on notebook record |
| `src/app/reader/components/notebook/MetaWillEditor.tsx` | Five sections, textareas, Link note dropdown, chips |
| `src/app/reader/components/notebook/NotebookEditor.tsx` | Route: metaWill / seed → `MetaWillEditor`; else freeform `TextEditor` |
| `src/store/metaWillUiStore.ts` | Focused section id for path B |
| `src/app/reader/components/sidebar/BooknoteItem.tsx` | Desktop path B: if focused section + notebook visible, append link |
| `src/services/echoes/promptBuilder.ts` | Optional `readerIntention` line |
| `src/services/echoes/runEchoes.ts` | Accept intention; suffix retrieve query; pass to prompt |
| `src/store/notebookStore.ts` | `NotebookTab` without `echoes` |
| `src/app/reader/components/notebook/NotebookTabNavigation.tsx` | Notes + AI only |
| `src/app/reader/components/notebook/Notebook.tsx` | Remove EchoesPanel branch |
| `src/app/reader/components/sidebar/TabNavigation.tsx` | Add Echoes tab |
| `src/app/reader/components/sidebar/Content.tsx` | Render `EchoesPanel` for `echoes` tab |
| Call sites that `setNotebookActiveTab('echoes')` | Open left sidebar Echoes instead |

---

### Task 1: Types and pure meta-will helpers

**Files:**
- Modify: `src/types/book.ts` (after `AskRegister`, on `BookNote`)
- Create: `src/utils/metaWill.ts`
- Test: `src/__tests__/utils/metaWill.test.ts`

**Interfaces:**
- Produces:
```ts
// types/book.ts
export type MetaWillSectionId = 'why' | 'shifted' | 'take' | 'refuse' | 'open';
export type MetaWillNoteLink = {
  booknoteId: string;
  excerpt?: string;
  chapterLabel?: string;
};
export type MetaWillSection = {
  id: MetaWillSectionId;
  text: string;
  links: MetaWillNoteLink[];
};
export type MetaWill = { sections: MetaWillSection[] };
// on BookNote:
/** Local-only; cloud sync may drop this field. Book reading frame (meta-will). */
metaWill?: MetaWill;

// utils/metaWill.ts
export const META_WILL_SECTION_IDS: readonly MetaWillSectionId[];
export const META_WILL_SECTION_LABELS: Record<MetaWillSectionId, string>;
export function createEmptyMetaWill(): MetaWill;
export function getReadingIntention(metaWill: MetaWill | undefined | null): string | null;
export function composeMetaWillNote(metaWill: MetaWill): string;
export function appendMetaWillLink(
  metaWill: MetaWill,
  sectionId: MetaWillSectionId,
  link: MetaWillNoteLink,
): MetaWill; // no-op duplicate booknoteId in same section
export function removeMetaWillLink(
  metaWill: MetaWill,
  sectionId: MetaWillSectionId,
  booknoteId: string,
): MetaWill;
export function groupAnnotateNotesByChapter(
  notes: BookNote[],
  resolveChapter: (note: BookNote) => { href: string; label: string },
): { href: string; label: string; notes: BookNote[] }[];
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  META_WILL_SECTION_IDS,
  META_WILL_SECTION_LABELS,
  appendMetaWillLink,
  composeMetaWillNote,
  createEmptyMetaWill,
  getReadingIntention,
  removeMetaWillLink,
} from '@/utils/metaWill';

describe('metaWill helpers', () => {
  it('seeds five empty sections in canonical order', () => {
    const m = createEmptyMetaWill();
    expect(m.sections.map((s) => s.id)).toEqual([...META_WILL_SECTION_IDS]);
    expect(m.sections.every((s) => s.text === '' && s.links.length === 0)).toBe(true);
  });

  it('getReadingIntention trims why or returns null', () => {
    const m = createEmptyMetaWill();
    expect(getReadingIntention(m)).toBeNull();
    m.sections[0]!.text = '  for leadership  ';
    expect(getReadingIntention(m)).toBe('for leadership');
    expect(getReadingIntention(undefined)).toBeNull();
  });

  it('composeMetaWillNote uses exact heading labels', () => {
    const m = createEmptyMetaWill();
    m.sections[0]!.text = 'Intent';
    const body = composeMetaWillNote(m);
    for (const id of META_WILL_SECTION_IDS) {
      expect(body).toContain(`## ${META_WILL_SECTION_LABELS[id]}`);
    }
    expect(body).toContain('Intent');
  });

  it('append is idempotent per section; remove does not delete other sections’ links', () => {
    let m = createEmptyMetaWill();
    const link = { booknoteId: 'a1', excerpt: 'hi', chapterLabel: 'Ch 1' };
    m = appendMetaWillLink(m, 'take', link);
    m = appendMetaWillLink(m, 'take', link);
    expect(m.sections.find((s) => s.id === 'take')!.links).toHaveLength(1);
    m = appendMetaWillLink(m, 'refuse', link);
    m = removeMetaWillLink(m, 'take', 'a1');
    expect(m.sections.find((s) => s.id === 'take')!.links).toHaveLength(0);
    expect(m.sections.find((s) => s.id === 'refuse')!.links).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/utils/metaWill.test.ts`  
Expected: FAIL, cannot resolve `@/utils/metaWill`.

- [ ] **Step 3: Add types and implement `src/utils/metaWill.ts`**

`META_WILL_SECTION_LABELS`: why→`Why I read it`, shifted→`What shifted`, take→`What I take`, refuse→`What I refuse`, open→`Still open`.  
`composeMetaWillNote`: for each section, `## {label}\n\n{text}\n` then for each link a markdown line `- {chapterLabel}: {excerpt}` (display-only in composed note; ids live in `metaWill`).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/utils/metaWill.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/book.ts src/utils/metaWill.ts src/__tests__/utils/metaWill.test.ts
git commit -m "feat(notebook): meta-will types and pure helpers"
```

---

### Task 2: Seed empty notebook + MetaWillEditor (text only)

**Files:**
- Create: `src/app/reader/hooks/useSaveNotebookMetaWill.ts`
- Create: `src/app/reader/components/notebook/MetaWillEditor.tsx`
- Modify: `src/app/reader/components/notebook/NotebookEditor.tsx`
- Modify: `src/app/reader/utils/notebookDocument.ts` — `upsertNotebookRecord` must preserve `metaWill` via `...existing` (already does); when creating, allow optional `metaWill` arg
- Test: `src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx`
- Test: `src/__tests__/utils/metaWillSeed.test.ts` (or fold into MetaWillEditor test) for seed vs legacy

**Interfaces:**
- Consumes: `createEmptyMetaWill`, `composeMetaWillNote`, `META_WILL_SECTION_LABELS` from Task 1
- Produces:
```ts
// useSaveNotebookMetaWill(bookKey) => (metaWill: MetaWill) => void
// Persists notebook BookNote: metaWill + note: composeMetaWillNote(metaWill),
// creates notebook if missing (needs compatibility CFI like coordinator).
// After save, hydrate notebookDocumentStore with composed note so coordinator stays aligned.

// NotebookEditor routing:
// - if notebook.metaWill → MetaWillEditor
// - else if !notebook || !notebook.note.trim() → seed createEmptyMetaWill(), save, MetaWillEditor
// - else → existing TextEditor path
```

- [ ] **Step 1: Write the failing tests**

```ts
// MetaWillEditor.test.tsx — render with seeded metaWill; assert five labelled textboxes;
// change Why I read it; assert save hook called with updated text.

// metaWillSeed policy (pure or thin wrapper):
it('shouldSeedMetaWill: true when no notebook or empty note without metaWill', …);
it('shouldSeedMetaWill: false when note has text and metaWill absent', …);
it('shouldSeedMetaWill: false when metaWill already present', …);
```

Export `shouldSeedMetaWill(notebook: BookNote | null): boolean` from `metaWill.ts`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/utils/metaWill.test.ts src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx`  
Expected: FAIL on new assertions / missing module.

- [ ] **Step 3: Implement save hook, MetaWillEditor, NotebookEditor routing, `shouldSeedMetaWill`**

Section UI: label + textarea (`aria-label` = section label). Debounce saves (~300–750ms) through the hook. Placeholder on empty why optional: none required (soft). No Link note yet.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/utils/metaWill.test.ts src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/metaWill.ts src/app/reader/hooks/useSaveNotebookMetaWill.ts \
  src/app/reader/components/notebook/MetaWillEditor.tsx \
  src/app/reader/components/notebook/NotebookEditor.tsx \
  src/app/reader/utils/notebookDocument.ts \
  src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx \
  src/__tests__/utils/metaWill.test.ts
git commit -m "feat(notebook): seed meta-will template in empty notebook"
```

---

### Task 3: Link note dropdown + chips (path A)

**Files:**
- Modify: `src/app/reader/components/notebook/MetaWillEditor.tsx`
- Create: `src/app/reader/components/notebook/MetaWillNoteChip.tsx` (optional if small — inline is fine)
- Modify: `src/store/metaWillUiStore.ts` (create) — `focusedSectionId: MetaWillSectionId | null`
- Test: extend `MetaWillEditor.test.tsx`

**Interfaces:**
- Consumes: `appendMetaWillLink`, `removeMetaWillLink`, `groupAnnotateNotesByChapter`
- Produces: per-section “Link note” control; chip list under section body

- [ ] **Step 1: Write the failing test**

```ts
it('Link note appends a chip under the section and excludes the notebook record', async () => {
  // provide annotate notes + toc resolver mock
  // open Link note on What I take → pick note → expect chip with excerpt
  // notebook id "notebook" must not appear in the menu
});

it('removing a chip does not call delete on the source annotation', async () => {
  // remove chip → save metaWill without that link; deleteBooknote never called
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx`  
Expected: FAIL on missing Link note / chip.

- [ ] **Step 3: Implement dropdown + chips**

Group with existing `findTocItemBS` pattern from `BooknoteView`. Chip shows `chapterLabel` + truncated excerpt; click chip → navigate to annotation CFI (reuse `BooknoteItem` / view `goTo` pattern already used in sidebar). Remove control on chip. On section focus/focus-within, set `metaWillUiStore.focusedSectionId`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/components/notebook/MetaWillEditor.tsx \
  src/app/reader/components/notebook/MetaWillNoteChip.tsx \
  src/store/metaWillUiStore.ts \
  src/__tests__/app/reader/components/notebook/MetaWillEditor.test.tsx
git commit -m "feat(notebook): link annotations into meta-will sections"
```

---

### Task 4: Desktop path B (Annotate click → append)

**Files:**
- Modify: `src/app/reader/components/sidebar/BooknoteItem.tsx`
- Test: `src/__tests__/components/BooknoteView.test.tsx` or new `MetaWillLinkFromSidebar.test.tsx`

**Interfaces:**
- Consumes: `metaWillUiStore.focusedSectionId`, notebook visible + `metaWill` present, desktop check
- Desktop = not (`appService?.isMobile` or `innerWidth < 640` or `innerHeight < 640` or forced mobile layout) — match `Notebook.tsx` / `TabNavigation` conventions

- [ ] **Step 1: Write the failing test**

```ts
it('on desktop, clicking an annotation while a meta-will section is focused appends a link', …);
it('on mobile, clicking an annotation never appends a meta-will link', …);
it('with no focused section, click keeps navigate behavior', …);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/components/BooknoteView.test.tsx` (or the new file)  
Expected: FAIL

- [ ] **Step 3: Implement intercept in BooknoteItem click handler**

When desktop && notebook visible && focusedSectionId && current book notebook has `metaWill` && item is annotation (not bookmark/echo/notebook): `preventDefault` navigate, `appendMetaWillLink` + save via the same persist helper, then return. Otherwise existing behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: same test file  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/reader/components/sidebar/BooknoteItem.tsx \
  src/__tests__/components/BooknoteView.test.tsx \
  src/__tests__/app/reader/components/notebook/MetaWillLinkFromSidebar.test.tsx
git commit -m "feat(notebook): desktop click-to-link notes into meta-will"
```

---

### Task 5: Echoes intention tilt (query + prompt)

**Files:**
- Modify: `src/services/echoes/promptBuilder.ts` — add optional `readerIntention?: string`
- Modify: `src/services/echoes/runEchoes.ts` — `runEchoes(..., intention?: string | null)` or pass on seed; when non-null/non-empty after trim, retrieve query = `${retrieveQuery(seed)}\nReader intention: ${intention}` and pass into `buildEchoesPrompt`
- Modify: Echoes call site(s) that invoke `runEchoes` (panel / annotator flow) to pass `getReadingIntention(notebook?.metaWill)`
- Test: `src/__tests__/echoes/runEchoes.test.ts`

**Interfaces:**
- Consumes: `getReadingIntention`
- Produces: prompt contains exact line `Reader intention: {text}` when set; omitted when empty

- [ ] **Step 1: Write the failing test**

```ts
it('buildEchoesPrompt omits Reader intention when unset', () => {
  const { prompt } = buildEchoesPrompt({ sources: [], seedText: 'x' });
  expect(prompt).not.toContain('Reader intention:');
});

it('buildEchoesPrompt includes Reader intention line when set', () => {
  const { prompt } = buildEchoesPrompt({
    sources: [],
    seedText: 'x',
    readerIntention: 'pressure-test meta-will',
  });
  expect(prompt).toContain('Reader intention: pressure-test meta-will');
});

it('runEchoes retrieve query includes intention only when provided', async () => {
  // mock retrieve; call with intention → query includes it; without → equals retrieveQuery(seed)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/echoes/runEchoes.test.ts`  
Expected: FAIL on new cases.

- [ ] **Step 3: Implement prompt + runEchoes + wire call site**

No client re-rank. Keep sandbox flags unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/echoes/runEchoes.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/echoes/promptBuilder.ts src/services/echoes/runEchoes.ts \
  src/app/reader/components/notebook/EchoesPanel.tsx \
  src/__tests__/echoes/runEchoes.test.ts
git commit -m "feat(echoes): tilt retrieve and prompt by reading intention"
```

---

### Task 6: Move Echoes to left sidebar

**Files:**
- Modify: `src/store/notebookStore.ts` — `NotebookTab = 'notes' | 'ai'`
- Modify: `src/app/reader/components/notebook/NotebookTabNavigation.tsx`
- Modify: `src/app/reader/components/notebook/Notebook.tsx` — remove echoes branch / import
- Modify: `src/app/reader/components/sidebar/TabNavigation.tsx` — add `echoes` tab + `EchoesIcon`
- Modify: `src/app/reader/components/sidebar/Content.tsx` — render `EchoesPanel` when `targetTab === 'echoes'` (not inside OverlayScrollbars if panel needs full height — match notebook panel layout; prefer full-height flex child like history)
- Update call sites: `Annotator.tsx`, `BooknoteItem.tsx`, `BooknoteView.tsx`, `useBooksManager.ts`, `app/library/echoes/page.tsx` — open left sidebar + set `sideBarTab: 'echoes'` (and show sidebar); do not call `setNotebookActiveTab('echoes')`
- If `notebookActiveTab === 'echoes'` persisted in memory for old sessions, coerce to `'notes'` on read
- Tests: `NotebookTabNavigation.design.test.tsx`, `SideBarShortcuts` / `SidebarContent` as needed, EchoesPanel mount from sidebar

**Interfaces:**
- Helper (optional): `openEchoesSidebar(bookKey)` in a small util used by all call sites — sets sidebar visible, `sideBarTab: 'echoes'`, activates echo UI store as today

- [ ] **Step 1: Write the failing tests**

```ts
// NotebookTabNavigation: AI off → only Notes; AI on → Notes + AI; no Echoes
// TabNavigation: includes Echoes button
// openEchoesSidebar / call-site unit: does not set notebookActiveTab to echoes
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/app/reader/components/notebook/NotebookTabNavigation.design.test.tsx`  
Expected: FAIL (Echoes still present / expectations flipped).

- [ ] **Step 3: Implement chrome move + call-site redirects**

Keep `EchoesPanel` component; change only where it mounts. Library Echoes page behavior: still open reader + Echoes surface (now left tab).

- [ ] **Step 4: Run tests to verify they pass**

Run:  
`pnpm test -- src/__tests__/app/reader/components/notebook/NotebookTabNavigation.design.test.tsx src/__tests__/components/SideBarShortcuts.test.ts src/__tests__/components/SidebarContent.test.tsx src/__tests__/app/reader/components/notebook/EchoesPanel.test.tsx`  
Expected: PASS (update mocks if panel parent changed).

- [ ] **Step 5: Commit**

```bash
git add src/store/notebookStore.ts \
  src/app/reader/components/notebook/NotebookTabNavigation.tsx \
  src/app/reader/components/notebook/Notebook.tsx \
  src/app/reader/components/sidebar/TabNavigation.tsx \
  src/app/reader/components/sidebar/Content.tsx \
  src/app/reader/components/annotator/Annotator.tsx \
  src/app/reader/components/sidebar/BooknoteItem.tsx \
  src/app/reader/components/sidebar/BooknoteView.tsx \
  src/app/reader/hooks/useBooksManager.ts \
  src/app/library/echoes/page.tsx \
  src/__tests__/app/reader/components/notebook/NotebookTabNavigation.design.test.tsx \
  src/__tests__/components/SidebarContent.test.tsx
git commit -m "feat(echoes): move Echoes tab to left sidebar"
```

---

## Self-review notes

- Spec goals 1–4 each map to Tasks 2, 3–4, 5, 6.
- Storage choice locked to structured `metaWill` (spec option A) with composed `note` dual-write.
- No Ask / LightRAG / force-modal tasks (non-goals).
- Review Focus lines each have a owning task test.
