# Fast Antigravity Notebook Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notebook AI on Tauri uses `agy` as a fast completer with first-turn book metadata, web search allowed, and no LightRAG on the chat path.

**Architecture:** Rewrite prompt packing in `AntigravityChatAdapter`; pass open-book metadata from `AIAssistant`; keep `--sandbox` + `--dangerously-skip-permissions`; persist `agyConversationId` for follow-ups without resending metadata.

**Tech Stack:** TypeScript, Vitest, existing `completeWithAntigravity` / `tauriRunCommand`, Readest book metadata types.

## Global Constraints

- Platform: macOS desktop (Tauri) notebook path
- No LightRAG retrieve/MCP in chat
- Metadata pack only on first turn (~1500–2000 char hard cap)
- Web search allowed; filesystem / open-book-from-disk forbidden via prompt + sandbox
- Buffer-then-emit OK (no streaming required)

---

## File structure

| File | Responsibility |
|------|----------------|
| `apps/readest-app/src/services/ai/adapters/bookContext.ts` (new) | Pure helpers: normalize book metadata → capped text pack |
| `apps/readest-app/src/services/ai/adapters/AntigravityChatAdapter.ts` | Prompt + adapter; first-turn detection; agy flags |
| `apps/readest-app/src/app/reader/components/notebook/AIAssistant.tsx` | Supply metadata fields to adapter options |
| `apps/readest-app/src/__tests__/ai/bookContext.test.ts` (new) | Cap + field packing tests |
| `apps/readest-app/src/__tests__/ai/antigravityChatAdapter.test.ts` | First vs follow-up prompt + flags |

---

### Task 1: Book metadata pack helper

**Files:**
- Create: `apps/readest-app/src/services/ai/adapters/bookContext.ts`
- Test: `apps/readest-app/src/__tests__/ai/bookContext.test.ts`

**Interfaces:**
- Consumes: plain fields from open book (title, author, tags, series, publisher, published, subjects, description)
- Produces: `formatBookMetadataPack(input, maxChars = 1800): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { formatBookMetadataPack } from '@/services/ai/adapters/bookContext';

describe('formatBookMetadataPack', () => {
  it('includes core fields', () => {
    const text = formatBookMetadataPack({
      title: 'Dune',
      author: 'Herbert',
      tags: ['sf'],
      series: 'Dune',
      seriesIndex: 1,
      publisher: 'Chilton',
      published: '1965',
      subjects: ['Fiction'],
      description: 'Desert planet.',
    });
    expect(text).toContain('Title: Dune');
    expect(text).toContain('Author: Herbert');
    expect(text).toContain('Tags: sf');
    expect(text).toContain('Series: Dune (#1)');
    expect(text).toContain('Desert planet');
  });

  it('respects maxChars', () => {
    const text = formatBookMetadataPack(
      { title: 'T', author: 'A', description: 'x'.repeat(5000) },
      200,
    );
    expect(text.length).toBeLessThanOrEqual(200);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/readest-app && npx vitest run src/__tests__/ai/bookContext.test.ts`

- [ ] **Step 3: Implement helper**

```ts
export type BookContextInput = {
  title?: string;
  author?: string;
  tags?: string[];
  series?: string;
  seriesIndex?: number;
  publisher?: string;
  published?: string;
  subjects?: string | string[];
  description?: string;
};

export function formatBookMetadataPack(input: BookContextInput, maxChars = 1800): string {
  const subjects = Array.isArray(input.subjects)
    ? input.subjects.join(', ')
    : input.subjects || '';
  const lines: string[] = [];
  if (input.title?.trim()) lines.push(`Title: ${input.title.trim()}`);
  if (input.author?.trim()) lines.push(`Author: ${input.author.trim()}`);
  if (input.tags?.length) lines.push(`Tags: ${input.tags.join(', ')}`);
  if (input.series?.trim()) {
    const idx =
      typeof input.seriesIndex === 'number' ? ` (#${input.seriesIndex})` : '';
    lines.push(`Series: ${input.series.trim()}${idx}`);
  }
  if (input.publisher?.trim()) lines.push(`Publisher: ${input.publisher.trim()}`);
  if (input.published?.trim()) lines.push(`Published: ${input.published.trim()}`);
  if (subjects.trim()) lines.push(`Subjects: ${subjects.trim()}`);
  if (input.description?.trim()) lines.push(`Description: ${input.description.trim()}`);
  let text = lines.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  return text;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/adapters/bookContext.ts \
  apps/readest-app/src/__tests__/ai/bookContext.test.ts
git commit -m "feat(ai): add capped book metadata pack helper"
```

---

### Task 2: Rewrite Antigravity prompt (no LightRAG)

**Files:**
- Modify: `apps/readest-app/src/services/ai/adapters/AntigravityChatAdapter.ts`
- Modify: `apps/readest-app/src/__tests__/ai/antigravityChatAdapter.test.ts`

**Interfaces:**
- Consumes: `formatBookMetadataPack`, `BookContextInput`
- Produces: `buildAntigravityPrompt({ bookTitle, authorName, bookContext?, includeBookContext, messages, resumeConversation })`

- [ ] **Step 1: Update failing tests** for new prompt contract

Expectations:
- Contains “web search” allow + “filesystem” forbid
- Does **not** contain `lightrag`, `/api/retrieve`, or `curl`
- When `includeBookContext: true`, contains metadata pack lines
- When `resumeConversation: true` or `includeBookContext: false`, omits Description/Tags pack
- Adapter run uses `--sandbox` and `--dangerously-skip-permissions`

- [ ] **Step 2: Run adapter tests — expect FAIL**

- [ ] **Step 3: Implement prompt + options**

```ts
export type AntigravityAdapterOptions = {
  settings: AISettings;
  bookTitle: string;
  authorName: string;
  bookContext?: BookContextInput;
  agyConversationId?: string | null;
  onAgyConversationId?: (id: string) => void;
  runCommand: RunCommand;
};

export function buildAntigravityPrompt(opts: {
  bookTitle: string;
  authorName: string;
  bookContextPack?: string;
  includeBookContext: boolean;
  messages: Array<{ role: string; content: string }>;
  resumeConversation: boolean;
}): string {
  const authorLine = opts.authorName?.trim() ? ` by ${opts.authorName.trim()}` : '';
  const parts = [
    `You are a reading assistant helping with "${opts.bookTitle}"${authorLine}.`,
    '',
    'Rules:',
    '- You may use web search when it improves the answer.',
    '- Do not search the local filesystem, do not run find/grep/ls over the home directory, and do not open book files from disk.',
    '- Prefer a direct answer; keep tool use light.',
    '',
  ];
  if (opts.includeBookContext && opts.bookContextPack?.trim()) {
    parts.push('Book details:', opts.bookContextPack.trim(), '');
  }
  if (opts.resumeConversation) {
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    parts.push(`User:\n${lastUser?.content?.trim() || ''}`);
  } else {
    const transcript = opts.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(`Conversation:\n${transcript}`);
  }
  return parts.join('\n');
}
```

In `run`:
- `resumeConversation = Boolean(agyConversationId)`
- `includeBookContext = !resumeConversation`
- `bookContextPack = formatBookMetadataPack(bookContext ?? { title: bookTitle, author: authorName })`
- `completeWithAntigravity(..., { sandbox: true, skipPermissions: true })`

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/adapters/AntigravityChatAdapter.ts \
  apps/readest-app/src/__tests__/ai/antigravityChatAdapter.test.ts
git commit -m "feat(ai): first-turn metadata and web-search rules for agy chat"
```

---

### Task 3: Wire metadata from AIAssistant

**Files:**
- Modify: `apps/readest-app/src/app/reader/components/notebook/AIAssistant.tsx`

**Interfaces:**
- Consumes: `bookData.book` title/author/tags + `book.metadata` series/publisher/published/subject/description
- Produces: `bookContext` on `AntigravityAdapterOptions`

- [ ] **Step 1: In `AntigravityNotebookAssistant` / `AntigravityAIAssistantChat`, build `bookContext` from book data**

Normalize language maps / contributor objects to strings if helpers already exist in the codebase; otherwise `String(...)` / take `.name` carefully. Prefer fields already used elsewhere for display.

- [ ] **Step 2: Pass `bookContext` through `optionsRef` into `createAntigravityChatAdapter`**

- [ ] **Step 3: Manual smoke (or note in commit): new chat first question includes description cues; follow-up works**

- [ ] **Step 4: Commit**

```bash
git add apps/readest-app/src/app/reader/components/notebook/AIAssistant.tsx
git commit -m "feat(ai): supply open-book metadata to Antigravity adapter"
```

---

### Task 4 (optional): Abort kills agy

**Files:**
- Modify: `apps/readest-app/src/services/ai/ask/runCommand.ts` and/or `antigravityClient.ts` only if abort wiring is straightforward

- [ ] **Step 1: If `RunCommand` cannot take AbortSignal cheaply, skip this task**

- [ ] **Step 2: Else pass abortSignal to kill child on abort; add a small unit test with a mock**

- [ ] **Step 3: Commit if implemented**

```bash
git commit -m "fix(ai): abort notebook agy runs on composer cancel"
```

---

## Verification

- `npx vitest run src/__tests__/ai/bookContext.test.ts src/__tests__/ai/antigravityChatAdapter.test.ts`
- `pnpm install-macos` when ready for GUI check
- New chat question returns without `find ~`; first turn can use metadata; follow-up uses `--conversation`
