# Selection Ask → Auto-Note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore ungrounded selection Ask so a question about a highlight auto-saves the answer as that highlight’s note, and delete the old Ask chat / Ask-with-library / Questions history stack in favor of Echoes + notes.

**Architecture:** Slim `askService` to a one-shot ungrounded `runAsk` (prompt + `agy`, no retrieve/follow-up). Selection toolbar opens `AskComposer`; on submit, create the highlight like Annotate (while the selection is still live), dismiss UI, run Ask in the background, write the trimmed answer onto the booknote, toast. Delete `AskPanel`, history store, Questions page, and `ask-with-library`. Keep shared `antigravityClient` / `runCommand` / `agyShell` for Echoes and notebook chat.

**Tech Stack:** Readest TypeScript (Annotator, booknotes), Antigravity CLI via existing `completeWithAntigravity`, vitest.

## Global Constraints

- Note body = trimmed assistant answer only (no citation footer; highlight is the anchor).
- Silent wait: no AskPanel; toast on success/error.
- One in-flight selection Ask per book view.
- No Ask history persistence; notes are persistence.
- Library grounding is Echoes only — do not reintroduce `ask-with-library` retrieve.
- Do not delete `antigravityClient`, `runCommand`, or `agyShell`.
- Orphan `ask-history.json` on disk may remain; no migration required.
- macOS / Tauri path is the target; no live `agy` E2E required in this plan.

---

## File map

| File | Responsibility |
|------|----------------|
| `apps/readest-app/src/types/annotator.ts` | Re-add `ask` tool type |
| `apps/readest-app/src/utils/annotationToolbar.ts` | Default toolbar includes `ask`; sanitize legacy `ask-with-library` → `find-echoes`; keep `ask` |
| `apps/readest-app/src/app/reader/components/annotator/AnnotationTools.tsx` | Ask button (`LuMessageSquare`) |
| `apps/readest-app/src/services/ai/ask/types.ts` | Ungrounded-only request/result types |
| `apps/readest-app/src/services/ai/ask/promptBuilder.ts` | Selection prompt only (drop library branches) |
| `apps/readest-app/src/services/ai/ask/askService.ts` | One-shot `runAsk`; delete `runFollowUp` + retrieve |
| `apps/readest-app/src/components/ask/AskComposer.tsx` | Question dialog (no `mode`) |
| `apps/readest-app/src/components/ask/askErrors.ts` | Map agy errors; drop LightRAG “ask without library” |
| `apps/readest-app/src/services/ai/ask/runAskForNote.ts` *(new)* | Pure orchestration helper for headless Ask→note |
| `apps/readest-app/src/services/ai/fileSystemFromAppService.ts` *(new)* | Shared FS helper extracted from deleted history store |
| `apps/readest-app/src/app/reader/components/annotator/Annotator.tsx` | Wire Ask toolbar + composer + runner |
| **Delete** | `AskPanel.tsx`, `SourceChips.tsx`, `HistoryList.tsx`, `app/library/questions/`, `services/ai/history/`, related tests |

---

### Task 1: Slim Ask service to ungrounded one-shot

**Files:**
- Modify: `apps/readest-app/src/services/ai/ask/types.ts`
- Modify: `apps/readest-app/src/services/ai/ask/promptBuilder.ts`
- Modify: `apps/readest-app/src/services/ai/ask/askService.ts`
- Modify: `apps/readest-app/src/__tests__/ai/askService.test.ts`
- Modify: `apps/readest-app/src/__tests__/ai/promptBuilder.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AskRequest = {
    bookHash: string;
    bookTitle: string;
    selectionText: string;
    selectionCfi?: string;
    question: string;
  };
  export type AskResult = {
    answer: string;
    truncatedSelection: boolean;
  };
  export type AskDeps = {
    complete: typeof completeWithAntigravity;
    runCommand?: RunCommand;
    agyPath: string;
  };
  export async function runAsk(req: AskRequest, deps: AskDeps): Promise<AskResult>;
  ```
- Consumes: `buildAskPrompt`, `completeWithAntigravity`

- [ ] **Step 1: Rewrite failing tests for ungrounded-only API**

Replace `askService.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAsk } from '../../services/ai/ask/askService';

describe('runAsk', () => {
  it('completes without retrieve and returns trimmed answer', async () => {
    const complete = vi.fn(async () => ({ text: '  Answer text  \n', conversationId: 'c1' }));
    const result = await runAsk(
      {
        bookHash: 'h1',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      { complete: complete as never, agyPath: 'agy' },
    );
    expect(complete).toHaveBeenCalledOnce();
    expect(result.answer).toBe('Answer text');
    expect(result.truncatedSelection).toBe(false);
  });
});
```

Replace library-context test in `promptBuilder.test.ts` with a guard that sources/context are not part of the API (update `buildAskPrompt` input to only `bookTitle`, `selectionText`, `question`; remove `LIBRARY_CHAR_LIMIT` export if unused). Keep truncation test for selection.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run src/__tests__/ai/askService.test.ts src/__tests__/ai/promptBuilder.test.ts`

Expected: FAIL (API shape mismatch / missing trim).

- [ ] **Step 3: Implement slim types, prompt, service**

`types.ts`:

```ts
export type AskRequest = {
  bookHash: string;
  bookTitle: string;
  selectionText: string;
  selectionCfi?: string;
  question: string;
};

export type AskResult = {
  answer: string;
  truncatedSelection: boolean;
};
```

`promptBuilder.ts`: drop `sources` / `contextText` / `LIBRARY_CHAR_LIMIT` / `truncatedLibrary`. Prompt stays:

```ts
export function buildAskPrompt(input: {
  bookTitle: string;
  selectionText: string;
  question: string;
}): { prompt: string; truncatedSelection: boolean } {
  const sel = truncate(input.selectionText.trim(), SELECTION_CHAR_LIMIT);
  const prompt = `You are a careful reading assistant. Answer the user's question about the selected passage.

Book: ${input.bookTitle}

Selected passage:
"""
${sel.text}
"""

Question: ${input.question}
`;
  return { prompt, truncatedSelection: sel.truncated };
}
```

`askService.ts`:

```ts
export type AskDeps = {
  complete: typeof completeWithAntigravity;
  runCommand?: RunCommand;
  agyPath: string;
};

export async function runAsk(req: AskRequest, deps: AskDeps): Promise<AskResult> {
  const built = buildAskPrompt({
    bookTitle: req.bookTitle,
    selectionText: req.selectionText,
    question: req.question,
  });
  const { text } = await deps.complete(built.prompt, {
    agyPath: deps.agyPath,
    runCommand: deps.runCommand!,
  });
  return {
    answer: text.trim(),
    truncatedSelection: built.truncatedSelection,
  };
}
```

Delete `runFollowUp` and any retrieve/`AskMode` usage from this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: same vitest command as Step 2.  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/ask/types.ts \
  apps/readest-app/src/services/ai/ask/promptBuilder.ts \
  apps/readest-app/src/services/ai/ask/askService.ts \
  apps/readest-app/src/__tests__/ai/askService.test.ts \
  apps/readest-app/src/__tests__/ai/promptBuilder.test.ts
git commit -m "$(cat <<'EOF'
refactor(ai): slim Ask to ungrounded one-shot for notes

Drop ask-with-library retrieve, follow-ups, and library prompt branches.
EOF
)"
```

---

### Task 2: Slim AskComposer + askErrors

**Files:**
- Modify: `apps/readest-app/src/components/ask/AskComposer.tsx`
- Modify: `apps/readest-app/src/components/ask/askErrors.ts`
- Modify: `apps/readest-app/src/__tests__/ai/askErrors.test.ts`

**Interfaces:**
- Produces: `AskComposerProps` without `mode`; `mapAskError(err) => { message: string }`
- Consumes: none from Task 1 beyond types if needed

- [ ] **Step 1: Update askErrors tests**

```ts
describe('mapAskError', () => {
  it('surfaces Antigravity error messages', () => {
    expect(mapAskError(new AntigravityNotFoundError('/bin/agy')).message).toContain('agy not found');
    expect(mapAskError(new AntigravityAuthError()).message).toContain('not authenticated');
    expect(mapAskError(new AntigravityTimeoutError()).message).toContain('timed out');
  });

  it('falls back for unknown errors', () => {
    expect(mapAskError(new Error('boom')).message).toBe('boom');
  });
});
```

Remove LightRAG / `offerAskWithoutLibrary` expectations. Remove `LightRAGUnreachableError` import.

- [ ] **Step 2: Run test to verify fail/compile issues**

Run: `cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run src/__tests__/ai/askErrors.test.ts`  
Expected: FAIL until implementation matches.

- [ ] **Step 3: Implement**

`askErrors.ts`:

```ts
export type AskErrorInfo = { message: string };

export function mapAskError(err: unknown): AskErrorInfo {
  if (
    err instanceof AntigravityNotFoundError ||
    err instanceof AntigravityAuthError ||
    err instanceof AntigravityTimeoutError
  ) {
    return { message: err.message };
  }
  if (err instanceof Error && err.message) return { message: err.message };
  return { message: String(err) };
}
```

`AskComposer.tsx`: remove `mode` / `AskMode`; title always `_('Ask')`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/components/ask/AskComposer.tsx \
  apps/readest-app/src/components/ask/askErrors.ts \
  apps/readest-app/src/__tests__/ai/askErrors.test.ts
git commit -m "refactor(ai): simplify AskComposer and ask error mapping"
```

---

### Task 3: Extract shared FS helper, then delete Ask panel / history / Questions

**Files:**
- Create: `apps/readest-app/src/services/ai/fileSystemFromAppService.ts` *(move helper out of history)*
- Modify: `apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx` — import from new module
- Modify: `apps/readest-app/src/app/library/echoes/page.tsx` — import from new module; drop Questions comment
- Modify: `apps/readest-app/src/app/reader/components/sidebar/BooknoteItem.tsx` — import from new module
- Modify: `apps/readest-app/src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx` — mock new path
- Delete: `AskPanel.tsx`, `SourceChips.tsx`, `HistoryList.tsx`
- Delete: `apps/readest-app/src/app/library/questions/`
- Delete: `apps/readest-app/src/services/ai/history/`
- Delete: AskPanel / historyStore tests listed below

**Interfaces:**
- Produces:
  ```ts
  // services/ai/fileSystemFromAppService.ts
  export function fileSystemFromAppService(appService: AppService): FileSystem;
  ```
- Consumes: Echoes / BooknoteItem keep working after history deletion

- [ ] **Step 1: Grep for dead references + FS helper users**

```bash
rg -n "AskPanel|HistoryList|SourceChips|ask-history|createPersistentHistoryStore|library/questions|runFollowUp|fileSystemFromAppService" apps/readest-app --glob '*.{ts,tsx}'
```

- [ ] **Step 2: Move `fileSystemFromAppService` to `services/ai/fileSystemFromAppService.ts`**

```ts
import type { AppService, FileSystem } from '@/types/system';

/** AppService keeps `fs` on implementations but not on the public interface. */
export function fileSystemFromAppService(appService: AppService): FileSystem {
  const fs = (appService as unknown as { fs?: FileSystem }).fs;
  if (!fs) {
    throw new Error('AppService filesystem is unavailable');
  }
  return fs;
}
```

Update EchoesPanel, library echoes page, BooknoteItem (+ test mock path) to import from `@/services/ai/fileSystemFromAppService`.

- [ ] **Step 3: Delete history + Ask chat UI**

Delete:
- `components/ask/AskPanel.tsx`
- `components/ask/SourceChips.tsx`
- `components/ask/HistoryList.tsx`
- `app/library/questions/`
- `services/ai/history/`
- `__tests__/ai/askPanelSelectionArgs.test.tsx`
- `__tests__/ai/askPanelRebuild.test.ts`
- `__tests__/ai/askPanelTruncation.test.ts`
- `__tests__/ai/historyStore.test.ts`

- [ ] **Step 4: Verify**

```bash
rg "AskPanel|HistoryList|createPersistentHistoryStore|services/ai/history" apps/readest-app/src
cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run \
  src/__tests__/ai/askService.test.ts \
  src/__tests__/echoes/runEchoes.test.ts \
  src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx
```

Expected: no dead imports; tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/fileSystemFromAppService.ts \
  apps/readest-app/src/app/reader/components/notebook/EchoesPanel.tsx \
  apps/readest-app/src/app/library/echoes/page.tsx \
  apps/readest-app/src/app/reader/components/sidebar/BooknoteItem.tsx \
  apps/readest-app/src/__tests__/app/reader/components/sidebar/BooknoteItem.test.tsx \
  apps/readest-app/src/components/ask \
  apps/readest-app/src/app/library/questions \
  apps/readest-app/src/services/ai/history \
  apps/readest-app/src/__tests__/ai
git commit -m "$(cat <<'EOF'
chore(ai): remove Ask panel and Questions history

Move fileSystemFromAppService out so Echoes keep working; notes
replace Ask history persistence.
EOF
)"
```

---

### Task 4: Restore Ask on the selection toolbar

**Files:**
- Modify: `apps/readest-app/src/types/annotator.ts`
- Modify: `apps/readest-app/src/utils/annotationToolbar.ts`
- Modify: `apps/readest-app/src/app/reader/components/annotator/AnnotationTools.tsx`
- Modify: `apps/readest-app/src/__tests__/utils/annotationToolbar.test.ts`
- Modify: `apps/readest-app/src/__tests__/services/constants.test.ts` (if it asserts Ask absence)

**Interfaces:**
- Produces: `AnnotationToolType` includes `'ask'`; `DEFAULT_ANNOTATION_TOOLBAR_ITEMS` includes `'ask'` after `'annotate'`; sanitize maps only legacy `'ask-with-library'` → `'find-echoes'`
- Consumes: n/a

- [ ] **Step 1: Update toolbar tests**

In `annotationToolbar.test.ts`:

- Expect `DEFAULT_ANNOTATION_TOOLBAR_ITEMS` to contain `'ask'` and `'find-echoes'`, not `'ask-with-library'`.
- Expect `getToolbarToolTypes(['copy', 'ask', 'ask-with-library', 'tts'] as never, true)` → `['copy', 'ask', 'find-echoes', 'tts']` (legacy library slot → Echoes; `ask` kept).
- Expect `ALL_ANNOTATION_TOOL_TYPES` to include `'ask'` and match `annotationToolButtons` order (existing invariant test).

Update `constants.test.ts` similarly if it asserts Ask is absent.

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run src/__tests__/utils/annotationToolbar.test.ts src/__tests__/services/constants.test.ts`

- [ ] **Step 3: Implement toolbar restore**

`annotator.ts` — add `'ask'` to the union (near `'annotate'` / `'find-echoes'`).

`annotationToolbar.ts`:

```ts
export const ALL_ANNOTATION_TOOL_TYPES: AnnotationToolType[] = [
  'copy',
  'copylink',
  'highlight',
  'annotate',
  'ask',
  'find-echoes',
  // ...rest unchanged
];

export const DEFAULT_ANNOTATION_TOOLBAR_ITEMS: AnnotationToolType[] = [
  'copy',
  'highlight',
  'annotate',
  'ask',
  'find-echoes',
  'search',
  'dictionary',
  'translate',
  'tts',
  'proofread',
];

// Only the retired library Ask tool remaps; plain Ask is live again.
const RETIRED_ASK_TOOLS = new Set(['ask-with-library']);
```

Keep the sanitize loop that maps retired tools → `find-echoes`.

`AnnotationTools.tsx` — add button after Annotate:

```tsx
{
  type: 'ask',
  label: _('Ask'),
  tooltip: _('Ask about the selected text'),
  Icon: LuMessageSquare,
},
```

Import `LuMessageSquare` from `react-icons/lu`.

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/types/annotator.ts \
  apps/readest-app/src/utils/annotationToolbar.ts \
  apps/readest-app/src/app/reader/components/annotator/AnnotationTools.tsx \
  apps/readest-app/src/__tests__/utils/annotationToolbar.test.ts \
  apps/readest-app/src/__tests__/services/constants.test.ts
git commit -m "feat(echoes): restore Ask on selection toolbar beside Annotate"
```

---

### Task 5: Headless `runAskForNote` orchestration helper

**Files:**
- Create: `apps/readest-app/src/services/ai/ask/runAskForNote.ts`
- Create: `apps/readest-app/src/__tests__/ai/runAskForNote.test.ts`

**Interfaces:**
- Consumes: `runAsk` (Task 1), `mapAskError` (Task 2)
- Produces:
  ```ts
  export type AskForNoteDeps = {
    runAsk: typeof runAsk;
    askDeps: AskDeps;
    ensureHighlight: () => { id: string } | null | undefined;
    saveNote: (annotationId: string, note: string) => Promise<boolean>;
    toast: (opts: { type: 'info' | 'error'; message: string }) => void;
    t: (key: string) => string;
  };

  export type AskForNoteInput = {
    bookHash: string;
    bookTitle: string;
    selectionText: string;
    selectionCfi?: string;
    question: string;
  };

  /** Returns true if a note was saved. */
  export async function runAskForNote(
    input: AskForNoteInput,
    deps: AskForNoteDeps,
  ): Promise<boolean>;
  ```

Race-safe order (implements Annotate semantics):
1. `ensureHighlight()` first (selection still valid in caller)
2. `runAsk(...)`
3. `saveNote(id, answer)`
4. success toast `_('Note saved')` (or `_('Ask answer saved as note')`)
5. on error: error toast via `mapAskError`; do not save

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAskForNote } from '../../services/ai/ask/runAskForNote';

describe('runAskForNote', () => {
  it('creates highlight, saves trimmed answer, toasts success', async () => {
    const ensureHighlight = vi.fn(() => ({ id: 'n1' }));
    const saveNote = vi.fn(async () => true);
    const toast = vi.fn();
    const runAsk = vi.fn(async () => ({ answer: 'Hello', truncatedSelection: false }));

    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        selectionCfi: 'epubcfi(/1)',
        question: 'Why?',
      },
      {
        runAsk: runAsk as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight,
        saveNote,
        toast,
        t: (k) => k,
      },
    );

    expect(ok).toBe(true);
    expect(ensureHighlight).toHaveBeenCalledBefore(runAsk as never);
    expect(saveNote).toHaveBeenCalledWith('n1', 'Hello');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'info' }),
    );
  });

  it('toasts error and skips save when ask fails', async () => {
    const saveNote = vi.fn(async () => true);
    const toast = vi.fn();
    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      {
        runAsk: vi.fn(async () => {
          throw new Error('agy blew up');
        }) as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => ({ id: 'n1' }),
        saveNote,
        toast,
        t: (k) => k,
      },
    );
    expect(ok).toBe(false);
    expect(saveNote).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'agy blew up' }),
    );
  });

  it('aborts when highlight cannot be created', async () => {
    const runAsk = vi.fn();
    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      {
        runAsk: runAsk as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => null,
        saveNote: vi.fn(async () => true),
        toast: vi.fn(),
        t: (k) => k,
      },
    );
    expect(ok).toBe(false);
    expect(runAsk).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run src/__tests__/ai/runAskForNote.test.ts`

- [ ] **Step 3: Implement `runAskForNote.ts`**

```ts
import { mapAskError } from '@/components/ask/askErrors';
import { runAsk as defaultRunAsk, type AskDeps } from './askService';
import type { AskRequest } from './types';

export type AskForNoteDeps = {
  runAsk?: typeof defaultRunAsk;
  askDeps: AskDeps;
  ensureHighlight: () => { id: string } | null | undefined;
  saveNote: (annotationId: string, note: string) => Promise<boolean>;
  toast: (opts: { type: 'info' | 'error'; message: string }) => void;
  t: (key: string) => string;
};

export async function runAskForNote(
  input: AskRequest,
  deps: AskForNoteDeps,
): Promise<boolean> {
  const target = deps.ensureHighlight();
  if (!target?.id) {
    deps.toast({ type: 'error', message: deps.t('Could not create note anchor.') });
    return false;
  }

  const ask = deps.runAsk ?? defaultRunAsk;
  try {
    const result = await ask(input, deps.askDeps);
    const saved = await deps.saveNote(target.id, result.answer);
    if (!saved) return false;
    deps.toast({
      type: 'info',
      message: deps.t('Ask answer saved as note'),
      // callers may ignore extra fields
    } as { type: 'info' | 'error'; message: string });
    return true;
  } catch (err) {
    deps.toast({ type: 'error', message: mapAskError(err).message });
    return false;
  }
}
```

(Adjust toast typing to match `eventDispatcher.dispatch('toast', …)` shape used in Annotator — `type`, `message`, optional `timeout`.)

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/ask/runAskForNote.ts \
  apps/readest-app/src/__tests__/ai/runAskForNote.test.ts
git commit -m "feat(ai): add headless Ask→note orchestration helper"
```

---

### Task 6: Wire Annotator Ask → note

**Files:**
- Modify: `apps/readest-app/src/app/reader/components/annotator/Annotator.tsx`
- Create: `apps/readest-app/src/__tests__/components/annotator/AnnotatorAskNoteFlow.test.tsx` *(lightweight; mock stores + `runAskForNote`)*

**Interfaces:**
- Consumes: `AskComposer`, `runAskForNote`, `runAsk`, `completeWithAntigravity`, `tauriRunCommand`, `useSaveBooknoteNoteText`, existing `handleHighlight`
- Produces: toolbar `case 'ask'`; composer open/submit; in-flight guard

Wire sketch (place near other handlers; mirror former Ask commit + Annotate):

```tsx
const [showAskComposer, setShowAskComposer] = useState(false);
const [askSelectionText, setAskSelectionText] = useState('');
const [askSelectionCfi, setAskSelectionCfi] = useState<string | undefined>();
const askInFlightRef = useRef(false);
// Keep a ref to the pending annotation id created at submit time if needed.

const handleAsk = () => {
  if (!selection?.text) return;
  if (selection.popup && !selection.cfi) return;
  if (askInFlightRef.current) {
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _('Ask already in progress'),
      timeout: 2000,
    });
    return;
  }
  setShowAnnotPopup(false);
  void suppressNativeSelectionHandles();
  setAskSelectionText(selection.text);
  setAskSelectionCfi(
    selection.cfi ||
      (selection.popup ? undefined : view?.getCFI(selection.index, selection.range)),
  );
  setShowAskComposer(true);
};

const handleAskComposerSubmit = (question: string) => {
  if (!selection?.text) return;
  if (askInFlightRef.current) {
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _('Ask already in progress'),
      timeout: 2000,
    });
    return;
  }
  askInFlightRef.current = true;

  const bookHash = bookKey.split('-')[0]!;
  const bookTitle = bookData.book?.title || '';
  const selectionText = askSelectionText || selection.text;
  const selectionCfi = askSelectionCfi;

  // Capture href like Annotate before highlight.
  if (!selection.popup) {
    selection.href = progress.sectionHref;
  }

  setShowAskComposer(false);

  void (async () => {
    try {
      // Same source as EchoesPanel: `const ai = settings.aiSettings ?? DEFAULT_AI_SETTINGS`.
      const ai = settings.aiSettings ?? DEFAULT_AI_SETTINGS;
      await runAskForNote(
        {
          bookHash,
          bookTitle,
          selectionText,
          selectionCfi,
          question,
        },
        {
          askDeps: {
            complete: completeWithAntigravity,
            runCommand: tauriRunCommand,
            agyPath: ai.agyPath || DEFAULT_AI_SETTINGS.agyPath,
          },
          ensureHighlight: () => {
            const created = handleHighlight(true);
            return (
              created[0] ??
              getConfig(bookKey)?.booknotes?.find(
                (a) =>
                  a.type === 'annotation' &&
                  a.cfi === selectionCfi &&
                  !a.deletedAt,
              )
            );
          },
          saveNote: (id, note) => saveBooknoteNoteText(id, note),
          toast: (opts) =>
            eventDispatcher.dispatch('toast', { ...opts, timeout: 2000 }),
          t: _,
        },
      );
    } finally {
      askInFlightRef.current = false;
      handleDismissPopupAndSelection();
    }
  })();
};
```

Toolbar case:

```tsx
case 'ask':
  return {
    tooltipText: _(label),
    Icon,
    onClick: handleAsk,
    disabled: popupSelectionNoCfi,
  };
```

Include `showAskComposer` in `overlaySurfaceOpen`. Render:

```tsx
<AskComposer
  open={showAskComposer}
  selectionText={askSelectionText}
  bookTitle={bookData.book?.title || ''}
  onClose={() => setShowAskComposer(false)}
  onSubmit={handleAskComposerSubmit}
/>
```

**agy path:** Read the same settings source `AskPanel` / `AIAssistant` / `runEchoes` already use (search `agyPath` in those files and copy that pattern — do not invent a new settings key).

**Important:** Call `ensureHighlight` / `handleHighlight` **before** dismissing selection (inside `runAskForNote`’s first step, while Annotator still has live `selection`). Dismiss in `finally` after the run completes, or dismiss selection UI after highlight creation but keep `selection` state until highlight returns — prefer creating highlight synchronously at the start of submit before any `await`.

- [ ] **Step 1: Write a focused Annotator wiring test**

Mock heavy deps like `AnnotateNoteEditorFlow.test.tsx`. Assert:
- Submitting AskComposer calls a mocked `runAskForNote` once with selection text + question
- Second submit while in-flight does not call it again (if testable via mocked slow promise)

If full Annotator mount is too heavy, extract the submit handler into a tiny tested function in `runAskForNote`’s caller module — but prefer one Annotator test that clicks Ask → types question → submit and asserts `saveBooknoteNoteText` / highlight path via mocks.

- [ ] **Step 2: Run test — FAIL**

- [ ] **Step 3: Implement Annotator wiring**

- [ ] **Step 4: Run Annotator + ask unit tests — PASS**

```bash
cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run \
  src/__tests__/ai/runAskForNote.test.ts \
  src/__tests__/components/annotator/AnnotatorAskNoteFlow.test.tsx \
  src/__tests__/utils/annotationToolbar.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/app/reader/components/annotator/Annotator.tsx \
  apps/readest-app/src/__tests__/components/annotator/AnnotatorAskNoteFlow.test.tsx
git commit -m "$(cat <<'EOF'
feat(ai): selection Ask auto-saves the answer as a highlight note

Composer collects the question; headless agy run writes the note
silently and toasts when done.
EOF
)"
```

---

### Task 7: Final cleanup verification + rebuild

**Files:** none new (ops + grep)

- [ ] **Step 1: Dead-reference sweep**

```bash
rg -n "AskPanel|HistoryList|SourceChips|ask-with-library|AskMode|runFollowUp|createPersistentHistoryStore|library/questions|offerAskWithoutLibrary" \
  apps/readest-app --glob '*.{ts,tsx}'
```

Expected: only sanitize migration for legacy `ask-with-library` string (and tests for that). No UI/types for AskMode.

- [ ] **Step 2: Run focused AI + annotator suite**

```bash
cd apps/readest-app && pnpm exec dotenv -e .env -e .env.test.local -- vitest run \
  src/__tests__/ai/askService.test.ts \
  src/__tests__/ai/promptBuilder.test.ts \
  src/__tests__/ai/askErrors.test.ts \
  src/__tests__/ai/runAskForNote.test.ts \
  src/__tests__/utils/annotationToolbar.test.ts \
  src/__tests__/components/annotator/AnnotatorAskNoteFlow.test.tsx
```

Expected: all PASS.

- [ ] **Step 3: Install macOS app for dogfood**

```bash
cd apps/readest-app && pnpm install-macos
```

Manual: select text → Ask → question → dismiss → wait → note appears on highlight + toast.

- [ ] **Step 4: Commit any leftover comment/doc fixes from the sweep**

```bash
git add -A apps/readest-app
git status # ensure no accidental dist binaries
git commit -m "chore(ai): finish Ask→note cleanup sweep"
```

(Skip empty commit if clean.)

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Restore Ask on toolbar | 4 |
| AskComposer for question | 2, 6 |
| Headless ungrounded run | 1, 5, 6 |
| Auto-save note = trimmed answer | 5, 6 |
| Silent toast UX | 5, 6 |
| Annotate-equivalent highlight/CFI guards | 6 |
| One-in-flight guard | 6 |
| Delete AskPanel / history / Questions / ask-with-library | 3 |
| Keep shared agy plumbing | 1 (no delete) |
| Legacy toolbar sanitize `ask-with-library` → Echoes | 4 |
| No Ask history | 3, 5 |

## Self-review notes

- Highlight is created **before** `await runAsk` (Task 5/6) even though the product copy says “dismiss then run” — this preserves Annotate’s anchor semantics and avoids losing the selection during a long agy call. UI still feels silent (no panel).
- `ask-history.json` left on disk intentionally.
- Notebook AI / Echoes continue using `antigravityClient` unchanged.
