# Design: Ask in Four Registers (Epistemic Ecology)

**Date:** 2026-10-10
**Status:** Draft for review
**Repo:** `reader` (soft-fork Readest)
**Source idea:** Kojukhov, Levin, Bovshover, *From Subsumption to Semantic Mediation* (Algorithms 2025), §3.1 "epistemic ecology": Russell and Norvig's four agent types recast as four coexisting perspectives on the same input: the **what** (reflex / perceptual), **how** (model-based / narrative), **why** (goal-based / intentional), **should** (utility-based / normative). Perspectives coexist rather than compete; the orchestrator mediates meaning, it does not arbitrate a winner.
**Builds on:** `2026-10-10-contribution-ledger-echoes-trace-design.md`, which listed "PARDES / epistemic-ecology multi-register Ask answers" and "validation / confirm / dispute on Ask notes" as non-goals. This design is that next step.
**UX mockup:** `.superpowers/brainstorm/95991-1791683020/content/ask-note-layout.html` (layout A approved).

## Problem

One-tap Ask runs a single fixed "expand + argue" prompt and writes one paragraph of prose onto the highlight's note. The reader gets one undifferentiated voice mixed into the same field they edit by hand, with no way to keep their writing distinct or to react to parts of the answer.

## Goals

1. **Five registers per Ask.** Ask returns five short, labelled passages about the selection: What, How, Why, Should, Argue (steelman then counterpoint). All five persist as structured, **read-only** data on the annotation.
2. **Your note stays yours.** `BookNote.note` is never filled by Ask. It stays empty until you write; the sidebar shows an editable field (placeholder) above the agent block.
3. **Per-register feedback.** Each register carries a reaction row: 👍 like, 👎 dislike, ✅ correct, ❌ incorrect, 💬 propose. Reactions and proposals persist with the register.

## Non-goals

- A question composer or free-form chat (Ask stays one-tap).
- Feeding feedback back into future prompts, Echoes retrieval, or any model.
- Four separate model calls / a literal multi-agent orchestrator. One call, one parse.
- Cloud sync schema (`DBBookNote`, `transformBookNoteToDB/FromDB`) changes. Same local-only stance as `contribution`.
- A setting to switch back to the old single-paragraph Ask.
- Reactions on Echoes synthesis or hand-written notes.
- Writing the agent answer into `note` (rejected; dual-layer layout approved instead).

## Decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Call shape | One agy call; prompt asks for five `## What` / `## How` / `## Why` / `## Should` / `## Argue` sections | Cheapest, one process spawn; headings parse robustly across models |
| Parse strictness | All five sections required, else `AskParseError` → existing failure path (toast, placeholder removed) | A partial answer silently saved defeats the feature; the error is retryable |
| Dual layers | `askRegisters` = read-only agent answer; `note` = human writing only | Approved mockup: empty editable note on top, agent block below |
| Ask write path | On success: set `askRegisters`, leave `note` empty (or untouched if already set), `contribution: 'ai'` | Agent text must not become the note body |
| Hand-edit of `note` | Existing save path; if `askRegisters` present and `note` becomes non-empty, `contribution` → `co-authored` | Matches the ledger: both layers present |
| Feedback and `contribution` | Reactions / proposals do **not** change `contribution` | Feedback annotates the agent layer; it is not authorship of `note` |
| Feedback and `updatedAt` | Feedback writes do **not** bump `BookNote.updatedAt`; `AskRegisterFeedback.updatedAt` is its own stamp | Avoids sync churn and list reorders for a local-only field the cloud drops anyway |
| Sidebar layout | Your note (textarea / inline editor, placeholder "Add your thoughts…") → separator → "Ask · read only" registers with reactions → quote | Mockup A |
| In-book bubble | Bubble still follows `note` only. Ask with empty `note` = highlight, no bubble; full agent answer lives in the sidebar | Keeps the bubble as "your words in the page" |
| Copy / export | When copying an Ask annotation: human `note` (if any) then a clearly separated read-only registers block | Reader's words first; agent answer available but not mixed |
| Where reactions live | Annotations sidebar (`BooknoteItem` / `AskRegisters`) | Full card is the only place that shows the agent block |

## Data model

### `types/book.ts`

```ts
export type AskRegisterKind = 'what' | 'how' | 'why' | 'should' | 'argue';

export type AskRegisterFeedback = {
  rating?: 'like' | 'dislike';
  verdict?: 'correct' | 'incorrect';
  proposal?: string;
  updatedAt: number;
};

export type AskRegister = {
  kind: AskRegisterKind;
  text: string;
  feedback?: AskRegisterFeedback;
};

// on BookNote:
/**
 * Local-only; cloud sync may drop this field. Ask's four-register answer.
 * Read-only in the UI. Never written into `note`.
 */
askRegisters?: AskRegister[];
```

Sync note: `useNotesSync.processNewNote` merges `{ ...existingNote, ...incoming }`, and the cloud record never carries `askRegisters` or `contribution`, so these keys survive a pull on the device that wrote them. They are simply absent on other devices. Same as `contribution` today.

### Write rules

| Event | Effect |
| --- | --- |
| Ask succeeds | `askRegisters = registers`, `note` left empty/untouched, `contribution: 'ai'` |
| Ask parse fails (fewer than four sections) | throw → toast → placeholder removed; nothing written |
| Reader writes/edits `note` | existing path; if registers present and note non-empty → `co-authored` |
| Reader clears `note` while registers remain | `contribution` stays `co-authored` if it was (do not invent a demotion); registers unchanged |
| Reader taps 👍 / 👎 | toggle `feedback.rating`; same value again clears it |
| Reader taps ✅ / ❌ | toggle `feedback.verdict`; same value again clears it |
| Reader saves a proposal | set `feedback.proposal` (trimmed); empty clears it |
| Any feedback write | `feedback.updatedAt = now`; `BookNote.updatedAt` unchanged |

`renderAskRegistersMarkdown` remains a pure helper for copy/export only — **not** written into `note`.

## Prompt and parsing

The prompt asks for five headed sections, each 2–4 sentences, in a fixed order, prose only, nothing before the first heading. Register briefs (copied into the prompt verbatim):

- **What**: what the passage says, a plain restatement of its claim or content.
- **How**: how it works, the structure of the argument or image and what it rests on.
- **Why**: why it is here, the context and motive, what the author needs it to do in this book.
- **Should**: evaluation, is it right, where it is wrong, overstated, or worth resisting.
- **Argue**: briefly steelman the claim, then offer one genuine counterpoint or tension.

Parser accepts `#`, `##`, or `###` headings, case-insensitive label, optional trailing punctuation, any order, and ignores ``` fence lines. Output is always in canonical order `what, how, why, should, argue`. Missing or empty section → `AskParseError("Ask returned an incomplete answer. Try again.")`.

## Product UI (annotations sidebar)

When `item.askRegisters` is present (mockup A):

1. **AI / Co marker** as today (`ai` / `co-authored`).
2. **Your note** — always the editable surface:
   - empty → placeholder field ("Add your thoughts…"); tap opens the existing inline / notebook editor path.
   - non-empty → rendered note markdown + existing Edit affordance.
3. **Separator**, then label **"Ask · read only"**.
4. **`AskRegisters` list** — each row: label chip (`What` / `How` / `Why` / `Should`, via `_()`), register text, proposal line if any, reaction row `👍 👎 ✅ ❌ 💬`.
5. **Quote + meta** as today.

Reaction buttons: emoji glyph content, `aria-label` (Like / Dislike / Correct / Incorrect / Propose), `aria-pressed` when active. Active = full opacity + 1px `base-content` border (`eink-bordered`); inactive = reduced opacity. Clicks `stopPropagation`.

💬 toggles an inline `TextEditor` under that register with Cancel / Save (same anatomy as the inline note editor). Save persists the proposal; empty clears it.

In-book bubble, notebook editor for `note`, and Annotate flow are unchanged for human text. Notebook editor on an Ask annotation may later surface the read-only registers under the note field; v1 can show them only in the sidebar card if that keeps scope tight.

## Errors

| Case | Behavior |
| --- | --- |
| agy failure | unchanged (toast with mapped message, placeholder removed) |
| Parse failure | `AskParseError` message via existing `mapAskError` → toast; placeholder removed |
| Feedback save failure | error toast "Failed to save feedback. Please try again."; in-memory booknotes restored to pre-write array |
| Legacy Ask notes (no `askRegisters`, AI text already in `note`) | render as plain notes; no reaction row; no migration |

## Testing

- Unit: prompt / parser / `runAsk` registers; `runAskForNote` saves `{ contribution: 'ai', askRegisters }` and does **not** put register text into `note`; reaction toggles; proposal set/clear; feedback leaves `BookNote.updatedAt` alone.
- Component (`BooknoteItem`): Ask card shows empty-note placeholder above registers; after human edit, note body above registers; reaction click persists and does not navigate; proposal save persists.
- No cloud sync tests.
