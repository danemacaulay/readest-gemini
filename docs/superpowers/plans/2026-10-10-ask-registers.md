# Ask in Four Registers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One-tap Ask returns four labelled registers (What / How / Why / Should) as a read-only agent block on the annotation; the human `note` stays empty/editable with a placeholder above that block; each register gets reactions (👍 👎 ✅ ❌ 💬).

**Architecture:** One agy call with a four-heading prompt; a pure parser turns the text into `AskRegister[]`; `runAskForNote` writes **only** `askRegisters` (+ `contribution: 'ai'`), leaving `note` empty. Feedback is a pure updater over `askRegisters[].feedback`. `BooknoteItem` renders: your note (placeholder or body) → Ask · read only → registers with reactions.

**Tech Stack:** TypeScript, React, vitest + testing-library (jsdom), existing `updateBooknoteNoteText` / `useSaveBooknoteNoteText` / `runAskForNote` / `BooknoteItem` / `TextEditor` / `TextButton`.

**Spec:** `docs/superpowers/specs/2026-10-10-ask-registers-design.md`

All paths below are relative to `apps/readest-app/`. Run tests from that directory with `pnpm test -- <path>`.

## Global Constraints

- Local-only: do **not** change `DBBookNote`, `transformBookNoteToDB`, or `transformBookNoteFromDB`.
- One agy call per Ask. Keep `sandbox: true, skipPermissions: false` in `runAsk`.
- Parse is strict: all four registers required, else `AskParseError` with message exactly `Ask returned an incomplete answer. Try again.`
- Canonical register order everywhere: `what, how, why, should` (`ASK_REGISTER_KINDS`).
- Ask **never** writes register text into `BookNote.note`.
- Feedback writes never change `BookNote.updatedAt` or `BookNote.contribution`.
- Hand edits of `note` never touch `askRegisters`.
- Emoji glyphs: 👍 like, 👎 dislike, ✅ correct, ❌ incorrect, 💬 propose. `aria-label`s: `Like`, `Dislike`, `Correct`, `Incorrect`, `Propose`.
- E-ink: active reaction = `eink-bordered` + full opacity; inactive = `opacity-40`. No color-only state.
- Reaction/proposal controls `stopPropagation` so the card never navigates on a tap.
- Minimum code: no settings toggle, no legacy-prompt fallback, no migration of old Ask-in-`note` answers.

## Review Focus

- Model output with `#`/`###` headings, trailing colons, shuffled section order, or ``` fences around the whole answer must still parse to four registers in canonical order. (Task 2)
- Model output with only three sections must fail Ask with the parse message and leave no `askRegisters` behind. (Task 2 + Task 3)
- Ask success leaves `note` empty (or unchanged) and only sets `askRegisters`. (Task 3)
- Tapping a reaction in the sidebar must not dispatch `navigate`. (Task 5)
- Sidebar shows placeholder "Add your thoughts…" above registers when `note` is empty. (Task 5)
- A feedback write must leave `BookNote.updatedAt` unchanged. (Task 4)

---

## File map

| File | Responsibility |
| --- | --- |
| `src/types/book.ts` | `AskRegisterKind`, `AskRegisterFeedback`, `AskRegister`, `BookNote.askRegisters` |
| `src/utils/askRegisters.ts` | `ASK_REGISTER_KINDS`, `ASK_REGISTER_LABELS`, `renderAskRegistersMarkdown` (copy/export only) |
| `src/services/ai/ask/promptBuilder.ts` | Four-heading prompt |
| `src/services/ai/ask/parseAskRegisters.ts` | `parseAskRegisters`, `AskParseError` |
| `src/services/ai/ask/types.ts` | `AskResult.registers` |
| `src/services/ai/ask/askService.ts` | `runAsk` parses into registers |
| `src/services/ai/ask/runAskForNote.ts` | Save `askRegisters` + contribution; do not fill `note` |
| `src/utils/updateBooknoteNoteText.ts` | Optional `askRegisters` write; preserve on human edit |
| `src/app/reader/hooks/useSaveBooknoteNoteText.ts` | Options type gains `askRegisters` |
| `src/utils/askRegisterFeedback.ts` | `toggleAskReaction`, `setAskProposal`, `updateAskRegisterFeedback` |
| `src/app/reader/hooks/useSaveAskRegisterFeedback.ts` | Persist a feedback transform for one register |
| `src/app/reader/components/sidebar/AskRegisters.tsx` | Read-only register list + reaction rows + proposal editor |
| `src/app/reader/components/sidebar/BooknoteItem.tsx` | Your-note + Ask · read only layout |

---

### Task 1: Register types and markdown helper (copy/export)

**Files:**
- Modify: `src/types/book.ts` (next to `BookNoteContribution`, ~line 199–224)
- Create: `src/utils/askRegisters.ts`
- Test: `src/__tests__/utils/askRegisters.test.ts`

**Interfaces:**
- Produces:
```ts
// types/book.ts
export type AskRegisterKind = 'what' | 'how' | 'why' | 'should';
export type AskRegisterFeedback = {
  rating?: 'like' | 'dislike';
  verdict?: 'correct' | 'incorrect';
  proposal?: string;
  updatedAt: number;
};
export type AskRegister = { kind: AskRegisterKind; text: string; feedback?: AskRegisterFeedback };
// on BookNote:
/** Local-only; cloud sync may drop this field. Ask's four-register answer. Never written into `note`. */
askRegisters?: AskRegister[];

// utils/askRegisters.ts
export const ASK_REGISTER_KINDS: readonly AskRegisterKind[]; // ['what','how','why','should']
export const ASK_REGISTER_LABELS: Record<AskRegisterKind, string>; // What/How/Why/Should
export function renderAskRegistersMarkdown(registers: readonly AskRegister[]): string; // copy/export only
```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { ASK_REGISTER_KINDS, renderAskRegistersMarkdown } from '@/utils/askRegisters';

describe('renderAskRegistersMarkdown', () => {
  it('renders bold label paragraphs in canonical order', () => {
    const body = renderAskRegistersMarkdown([
      { kind: 'what', text: 'A claim.' },
      { kind: 'how', text: 'By analogy.' },
      { kind: 'why', text: 'To set up ch. 3.' },
      { kind: 'should', text: 'Overstated.' },
    ]);
    expect(body).toBe(
      '**What**\n\nA claim.\n\n**How**\n\nBy analogy.\n\n**Why**\n\nTo set up ch. 3.\n\n**Should**\n\nOverstated.',
    );
  });

  it('exposes the four kinds in order', () => {
    expect([...ASK_REGISTER_KINDS]).toEqual(['what', 'how', 'why', 'should']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/utils/askRegisters.test.ts`
Expected: FAIL, cannot resolve `@/utils/askRegisters`.

- [ ] **Step 3: Add the types and implement `src/utils/askRegisters.ts`**

`renderAskRegistersMarkdown` joins `**${label}**\n\n${text}` blocks with `\n\n`, in the order given. Ignore `feedback`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/utils/askRegisters.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/types/book.ts apps/readest-app/src/utils/askRegisters.ts apps/readest-app/src/__tests__/utils/askRegisters.test.ts
git commit -m "feat(ask): register types and markdown helper for copy/export"
```

---

### Task 2: Four-register prompt, parser, and `runAsk`

**Files:**
- Modify: `src/services/ai/ask/promptBuilder.ts`
- Create: `src/services/ai/ask/parseAskRegisters.ts`
- Modify: `src/services/ai/ask/types.ts`
- Modify: `src/services/ai/ask/askService.ts`
- Modify: `src/__tests__/ai/promptBuilder.test.ts`
- Create: `src/__tests__/ai/parseAskRegisters.test.ts`
- Modify: `src/__tests__/ai/askService.test.ts`

**Interfaces:**
- Consumes: `AskRegister`, `AskRegisterKind` from `@/types/book`; `ASK_REGISTER_KINDS`, `ASK_REGISTER_LABELS` from Task 1.
- Produces:
```ts
export class AskParseError extends Error {} // message: 'Ask returned an incomplete answer. Try again.'
export function parseAskRegisters(text: string): AskRegister[];
export type AskResult = { registers: AskRegister[]; truncatedSelection: boolean }; // `answer` removed
```

- [ ] **Step 1: Write the failing prompt test (extend `promptBuilder.test.ts`)**

```ts
it('asks for the four registers under fixed headings', () => {
  const { prompt } = buildAskPrompt({ bookTitle: 'B', selectionText: 'q' });
  expect(prompt).toContain('## What');
  expect(prompt).toContain('## How');
  expect(prompt).toContain('## Why');
  expect(prompt).toContain('## Should');
  expect(prompt).toContain('what the passage says');
  expect(prompt).toContain('where it is wrong');
  expect(prompt).not.toContain('Expand:');
  expect(prompt).toContain('Do not use tools');
});
```

- [ ] **Step 2: Write the failing parser tests**

```ts
import { describe, expect, it } from 'vitest';
import { AskParseError, parseAskRegisters } from '@/services/ai/ask/parseAskRegisters';

const full = `## What\nSays X.\n\n## How\nBy Y.\n\n## Why\nBecause Z.\n\n## Should\nMostly right.`;

describe('parseAskRegisters', () => {
  it('parses four sections in canonical order', () => {
    expect(parseAskRegisters(full)).toEqual([
      { kind: 'what', text: 'Says X.' },
      { kind: 'how', text: 'By Y.' },
      { kind: 'why', text: 'Because Z.' },
      { kind: 'should', text: 'Mostly right.' },
    ]);
  });

  it('accepts other heading levels, trailing colons, shuffled order, and code fences', () => {
    const messy = '```markdown\n### Should:\nNo.\n# WHY\nCtx.\n## How\nStruct.\n## What\nClaim.\n```';
    expect(parseAskRegisters(messy).map((r) => `${r.kind}=${r.text}`)).toEqual([
      'what=Claim.',
      'how=Struct.',
      'why=Ctx.',
      'should=No.',
    ]);
  });

  it('ignores text before the first heading', () => {
    expect(parseAskRegisters(`Sure, here you go:\n\n${full}`)[0]!.text).toBe('Says X.');
  });

  it('throws AskParseError when a register is missing or empty', () => {
    expect(() => parseAskRegisters('## What\nX.\n## How\nY.\n## Why\nZ.')).toThrow(AskParseError);
    expect(() => parseAskRegisters(`${full}`.replace('Mostly right.', ''))).toThrow(
      'Ask returned an incomplete answer. Try again.',
    );
  });
});
```

- [ ] **Step 3: Update `askService.test.ts` to expect registers**

```ts
it('builds the prompt, calls complete in sandbox, and returns parsed registers', async () => {
  const complete = vi.fn(async () => ({ text: '## What\nA.\n## How\nB.\n## Why\nC.\n## Should\nD.' }));
  const res = await runAsk(
    { bookHash: 'h', bookTitle: 'T', selectionText: 'sel' },
    { complete: complete as never, runCommand: vi.fn() as never, agyPath: 'agy' },
  );
  expect(res.registers.map((r) => r.text)).toEqual(['A.', 'B.', 'C.', 'D.']);
  expect(complete).toHaveBeenCalledWith(
    expect.stringContaining('## Should'),
    expect.objectContaining({ sandbox: true, skipPermissions: false }),
  );
});
```

- [ ] **Step 4: Run the three test files to verify they fail**

Run: `pnpm test -- src/__tests__/ai/promptBuilder.test.ts src/__tests__/ai/parseAskRegisters.test.ts src/__tests__/ai/askService.test.ts`
Expected: FAIL.

- [ ] **Step 5: Rewrite the prompt in `promptBuilder.ts`**

Keep the preamble sentence, the tool prohibition, and the Book/Author/Quote tail. Replace the numbered "Expand / Argue" block with this copy (verbatim):

```
Answer about the selected quote in four short registers, each 2–4 sentences, under exactly these four headings and in this order:

## What
What the passage says: a plain restatement of its claim or content.

## How
How it works: the structure of the argument or image, and what it rests on.

## Why
Why it is here: the context and motive, what the author needs it to do in this book.

## Should
Evaluation: is it right? Where it is wrong, overstated, or worth resisting.
```

Format line: `Plain prose under each heading — no JSON, no bullets, no tool traces, nothing before the first heading.`

- [ ] **Step 6: Implement `parseAskRegisters` in `parseAskRegisters.ts`**

Line-based: drop ``` fence lines; heading `/^#{1,3}\s*(what|how|why|should)\b[\s:.\-–—]*$/i`; last occurrence wins; return `ASK_REGISTER_KINDS.map(...)`; throw `AskParseError` if any kind missing or empty.

- [ ] **Step 7: Update `types.ts` and `askService.ts`**

`AskResult` drops `answer`, gains `registers`. `runAsk` returns `{ registers: parseAskRegisters(text), truncatedSelection }`.

- [ ] **Step 8: Run the three test files + lint**

Run: `pnpm test -- src/__tests__/ai/promptBuilder.test.ts src/__tests__/ai/parseAskRegisters.test.ts src/__tests__/ai/askService.test.ts && pnpm lint`
Expected: tests PASS; `tsc` may flag `runAskForNote.ts` reading `result.answer` (Task 3).

- [ ] **Step 9: Commit**

```bash
git add apps/readest-app/src/services/ai/ask/promptBuilder.ts apps/readest-app/src/services/ai/ask/parseAskRegisters.ts apps/readest-app/src/services/ai/ask/types.ts apps/readest-app/src/services/ai/ask/askService.ts apps/readest-app/src/__tests__/ai/promptBuilder.test.ts apps/readest-app/src/__tests__/ai/parseAskRegisters.test.ts apps/readest-app/src/__tests__/ai/askService.test.ts
git commit -m "feat(ask): four-register prompt and strict section parser"
```

---

### Task 3: Persist registers without filling `note`

**Files:**
- Modify: `src/utils/updateBooknoteNoteText.ts`
- Modify: `src/app/reader/hooks/useSaveBooknoteNoteText.ts`
- Modify: `src/services/ai/ask/runAskForNote.ts`
- Modify: `src/__tests__/utils/updateBooknoteNoteText.test.ts`
- Modify: `src/__tests__/ai/runAskForNote.test.ts`

**Interfaces:**
```ts
export interface UpdateBooknoteNoteTextOptions {
  contribution?: BookNoteContribution;
  askRegisters?: AskRegister[]; // set when provided; otherwise existing preserved
}
// runAskForNote: saveNote(id, noteText, options) — call with noteText '' and askRegisters set
```

- [ ] **Step 1: Write the failing updater tests**

```ts
const regs = [
  { kind: 'what', text: 'A' }, { kind: 'how', text: 'B' },
  { kind: 'why', text: 'C' }, { kind: 'should', text: 'D' },
] as const;

it('writes askRegisters when provided without requiring note text', () => {
  const res = updateBooknoteNoteText([note], note.id, '', 2000, {
    contribution: 'ai',
    askRegisters: [...regs],
  });
  expect(res!.updatedBooknote.note).toBe('');
  expect(res!.updatedBooknote.askRegisters).toEqual(regs);
  expect(res!.updatedBooknote.contribution).toBe('ai');
});

it('preserves askRegisters and their feedback on a human edit', () => {
  const withRegs = {
    ...note,
    contribution: 'ai' as const,
    askRegisters: [{ ...regs[0], feedback: { rating: 'like' as const, updatedAt: 1500 } }, ...regs.slice(1)],
  };
  const res = updateBooknoteNoteText([withRegs], note.id, 'my own words', 2000);
  expect(res!.updatedBooknote.note).toBe('my own words');
  expect(res!.updatedBooknote.contribution).toBe('co-authored');
  expect(res!.updatedBooknote.askRegisters).toEqual(withRegs.askRegisters);
});
```

- [ ] **Step 2: Update `runAskForNote.test.ts`**

```ts
expect(saveNote).toHaveBeenCalledWith('n1', '', { contribution: 'ai', askRegisters: regs });
```

Add: `AskParseError` → `ok === false`, `saveNote` not called, toast with parse message.

- [ ] **Step 3: Run both test files to verify they fail**

Run: `pnpm test -- src/__tests__/utils/updateBooknoteNoteText.test.ts src/__tests__/ai/runAskForNote.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

- `updateBooknoteNoteText`: `if (options?.askRegisters) updatedBooknote.askRegisters = options.askRegisters;`
- `SaveBooknoteNoteOptions = UpdateBooknoteNoteTextOptions`
- `runAskForNote`: `saveNote(target.id, '', { contribution: 'ai', askRegisters: result.registers })`
- Confirm `Annotator.tsx` already forwards options; no change expected.

- [ ] **Step 5: Run tests and lint**

Run: `pnpm test -- src/__tests__/utils/updateBooknoteNoteText.test.ts src/__tests__/ai/runAskForNote.test.ts src/__tests__/components/annotator/AnnotatorAskNoteFlow.test.tsx && pnpm lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/readest-app/src/utils/updateBooknoteNoteText.ts apps/readest-app/src/app/reader/hooks/useSaveBooknoteNoteText.ts apps/readest-app/src/services/ai/ask/runAskForNote.ts apps/readest-app/src/__tests__/utils/updateBooknoteNoteText.test.ts apps/readest-app/src/__tests__/ai/runAskForNote.test.ts
git commit -m "feat(ask): persist registers without writing into the note body"
```

---

### Task 4: Feedback updaters and save hook

**Files:**
- Create: `src/utils/askRegisterFeedback.ts`
- Create: `src/app/reader/hooks/useSaveAskRegisterFeedback.ts`
- Test: `src/__tests__/utils/askRegisterFeedback.test.ts`
- Test: `src/__tests__/app/reader/hooks/useSaveAskRegisterFeedback.test.ts`

**Interfaces:**
```ts
export type AskReaction = 'like' | 'dislike' | 'correct' | 'incorrect';
export function toggleAskReaction(
  feedback: AskRegisterFeedback | undefined, reaction: AskReaction, now: number,
): AskRegisterFeedback;
export function setAskProposal(
  feedback: AskRegisterFeedback | undefined, proposal: string, now: number,
): AskRegisterFeedback;
export function updateAskRegisterFeedback(
  booknotes: readonly BookNote[], noteId: string, kind: AskRegisterKind,
  transform: (feedback: AskRegisterFeedback | undefined) => AskRegisterFeedback,
): { booknotes: BookNote[]; updatedBooknote: BookNote } | null;

export function useSaveAskRegisterFeedback(bookKey: string): (
  noteId: string, kind: AskRegisterKind,
  transform: (feedback: AskRegisterFeedback | undefined) => AskRegisterFeedback,
) => Promise<boolean>;
```

- [ ] **Step 1: Write the failing updater tests** (same as prior plan: toggle exclusive/clear, rating⊥verdict, proposal trim/clear, `updatedAt` unchanged on `BookNote`, null for missing/deleted/register-less)

- [ ] **Step 2: Write the failing hook test** (persist via `updateBooknotes` + `saveConfig`; restore + toast `"Failed to save feedback. Please try again."` on reject)

- [ ] **Step 3: Run both to verify fail**

Run: `pnpm test -- src/__tests__/utils/askRegisterFeedback.test.ts src/__tests__/app/reader/hooks/useSaveAskRegisterFeedback.test.ts`

- [ ] **Step 4–5: Implement `askRegisterFeedback.ts` and `useSaveAskRegisterFeedback.ts`**

Same skeleton as `useSaveBooknoteNoteText` but no bubble transition / no `savingRef`. Updater never mutates inputs and never bumps `BookNote.updatedAt`.

- [ ] **Step 6: Run tests and lint**

- [ ] **Step 7: Commit**

```bash
git add apps/readest-app/src/utils/askRegisterFeedback.ts apps/readest-app/src/app/reader/hooks/useSaveAskRegisterFeedback.ts apps/readest-app/src/__tests__/utils/askRegisterFeedback.test.ts apps/readest-app/src/__tests__/app/reader/hooks/useSaveAskRegisterFeedback.test.ts
git commit -m "feat(ask): per-register feedback updaters and save hook"
```

---

### Task 5: Sidebar — your note above, Ask · read only below

**Files:**
- Create: `src/app/reader/components/sidebar/AskRegisters.tsx`
- Modify: `src/app/reader/components/sidebar/BooknoteItem.tsx`
- Modify: `src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx`

**Interfaces:**
```tsx
export type AskRegistersProps = {
  registers: readonly AskRegister[];
  onReact: (kind: AskRegisterKind, reaction: AskReaction) => void;
  onProposal: (kind: AskRegisterKind, text: string) => void;
};
export default function AskRegisters(props: AskRegistersProps): JSX.Element;
```

- [ ] **Step 1: Write the failing component tests**

```ts
const regs = [
  { kind: 'what', text: 'Says X.' }, { kind: 'how', text: 'By Y.' },
  { kind: 'why', text: 'Because Z.' }, { kind: 'should', text: 'Mostly right.' },
] as const;

it('shows an empty-note placeholder above read-only registers after Ask', () => {
  renderItem(makeItem({ note: '', contribution: 'ai', askRegisters: [...regs] }));
  expect(screen.getByText('Add your thoughts…')).toBeTruthy();
  expect(screen.getByText('Ask · read only')).toBeTruthy();
  expect(screen.getByText('Says X.')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Like' })).toHaveLength(4);
});

it('shows the human note above registers after the reader writes', () => {
  renderItem(makeItem({ note: 'my own words', contribution: 'co-authored', askRegisters: [...regs] }));
  expect(screen.getByText('my own words')).toBeTruthy();
  expect(screen.getByText('Ask · read only')).toBeTruthy();
  expect(screen.queryByText('Add your thoughts…')).toBeNull();
});

it('persists a reaction without navigating', async () => {
  const item = makeItem({ note: '', contribution: 'ai', askRegisters: [...regs] });
  mocks.state.booknotes = [item];
  const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
  renderItem(item);
  await act(async () => {
    fireEvent.click(screen.getAllByRole('button', { name: 'Incorrect' })[3]!);
  });
  expect((mocks.state.booknotes[0] as BookNote).askRegisters![3]!.feedback?.verdict).toBe('incorrect');
  expect((mocks.state.booknotes[0] as BookNote).updatedAt).toBe(1000);
  expect(dispatch).not.toHaveBeenCalledWith('navigate', expect.anything());
});

it('saves a proposal from the inline editor', async () => {
  const item = makeItem({ note: '', contribution: 'ai', askRegisters: [...regs] });
  mocks.state.booknotes = [item];
  renderItem(item);
  fireEvent.click(screen.getAllByRole('button', { name: 'Propose' })[0]!);
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'It says less than X.' } });
  await act(async () => {
    fireEvent.click(screen.getByText('Save'));
  });
  expect((mocks.state.booknotes[0] as BookNote).askRegisters![0]!.feedback?.proposal).toBe(
    'It says less than X.',
  );
});
```

- [ ] **Step 2: Run the test file — new block fails, existing pass**

Run: `pnpm test -- src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx`

- [ ] **Step 3: Implement `AskRegisters.tsx`**

Read-only list: label chip `_(ASK_REGISTER_LABELS[kind])`, text, proposal line, five reaction buttons with `aria-pressed`. Local proposal editor state. All clicks `stopPropagation`. Active `opacity-100 eink-bordered`, inactive `opacity-40`.

- [ ] **Step 4: Integrate in `BooknoteItem.tsx`**

When `item.askRegisters?.length`:
1. Keep AI/Co marker.
2. **Your note block:** if `item.note` → existing prose render + edit affordance; else show a tappable placeholder `_('Add your thoughts…')` that starts the existing inline edit path (`startEdit('')` when `inlineNoteEditing`, else notebook edit).
3. Separator + `_('Ask · read only')`.
4. `<AskRegisters …/>` wired to `useSaveAskRegisterFeedback`.
5. Quote / meta unchanged.

When no `askRegisters`, keep today's single-body layout.

New `_()` strings: `Add your thoughts…`, `Ask · read only`, `What`, `How`, `Why`, `Should`, `Like`, `Dislike`, `Correct`, `Incorrect`, `Propose`, `Proposal`.

- [ ] **Step 5: Run component + Ask flow + lint + full suite**

Run: `pnpm test -- src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx src/__tests__/components/annotator/AnnotatorAskNoteFlow.test.tsx && pnpm lint && pnpm test`

- [ ] **Step 6: Manual check**

Select → Ask. Sidebar: empty placeholder above four registers; no AI text in the note field; bubble absent until you write; reactions work; writing a note shows "Co" and keeps registers below. E-ink: active reaction has a 1px border.

- [ ] **Step 7: Commit**

```bash
git add apps/readest-app/src/app/reader/components/sidebar/AskRegisters.tsx apps/readest-app/src/app/reader/components/sidebar/BooknoteItem.tsx apps/readest-app/src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx
git commit -m "feat(notes): Ask card with editable note above read-only registers"
```
