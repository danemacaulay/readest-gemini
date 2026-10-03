# Readest + Antigravity + LightRAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Soft-fork Readest on macOS so a user can highlight text, Ask via Antigravity CLI, optionally ground in `lib-rag` LightRAG with citation chips, and revisit Q&A from a global searchable history.

**Architecture:** Keep Readest’s reader/highlight shell. Add additive modules under `apps/readest-app/src/services/ai/` for prompt building, Antigravity headless completion (bypassing Vercel `LanguageModel` for v1), LightRAG HTTP retrieve, and a local HistoryStore. Extend `lib-rag` with `POST /api/retrieve` that returns structured sources without answering via LightRAG’s LLM.

**Tech Stack:** Readest (Next.js + Tauri v2, AGPL), TypeScript, Vitest (or Readest’s existing test runner), Python 3.11 + FastAPI + LightRAG in `~/projects/lib-rag`, Antigravity CLI (`agy`).

## Global Constraints

- Platform: macOS desktop (Tauri) only for v1
- License: soft-fork inherits Readest AGPL-3.0
- Chat path: Antigravity CLI (`agy`), not Gemini CLI
- Retrieval: existing `lib-rag` LightRAG index only (no Readest Reedy RAG)
- Library grounding: opt-in (**Ask** vs **Ask with library**)
- Visuals: source chips in chat only (no graph viz)
- Persistence: local global searchable history; no cloud sync
- Antigravity v1: one-shot full-context prompts (`agy -p`), not `--conversation`
- Budgets: selection ≤ 4000 chars; library context ≤ 8000 chars; top 8 sources
- lib-rag default base URL: `http://127.0.0.1:8765`

---

## File structure (target)

```
# This repo (reader) — after Readest import
apps/readest-app/src/services/ai/
  ask/
    types.ts                 # AskRequest, AskResult
    promptBuilder.ts         # pack selection + optional library context
    antigravityClient.ts     # spawn agy -p, parse stream-json / text
    askService.ts            # orchestrate Ask / Ask with library
  lightrag/
    types.ts                 # LightRAGSource, LightRAGRetrieveResult
    client.ts                # HTTP client → lib-rag /api/retrieve
  history/
    types.ts                 # QAThread, QAMessage
    historyStore.ts          # persist + search + delete
  providers/                 # leave upstream; do not require Antigravity here

apps/readest-app/src/components/ask/
  SourceChips.tsx
  AskComposer.tsx            # question input after selection action
  AskPanel.tsx               # thread view for active book

apps/readest-app/src/app/library/questions/
  page.tsx                   # global history UI

apps/readest-app/src/__tests__/ai/
  promptBuilder.test.ts
  antigravityClient.test.ts
  lightragClient.test.ts
  historyStore.test.ts
  askService.test.ts

apps/readest-app/src-tauri/… # allowlist shell command for agy if required

# Sibling repo (~/projects/lib-rag)
src/calibre_rag/retrieve.py
src/calibre_rag/viz/server.py   # add POST /api/retrieve
tests/test_retrieve.py
```

---

### Task 1: Import Readest soft-fork baseline

**Files:**
- Create: repo contents from upstream Readest (git subtree or clone-into-repo)
- Create: `README.md` (project-specific overlay noting AGPL + Antigravity/LightRAG goals)
- Modify: none until build verified

**Interfaces:**
- Consumes: none
- Produces: buildable Readest macOS app under this repo

- [ ] **Step 1: Import upstream**

```bash
cd /Users/danemacaulay/projects/reader
# Prefer sparse history; keep AGPL LICENSE from upstream
git remote add readest https://github.com/readest/readest.git
git fetch readest main
git merge --allow-unrelated-histories readest/main -m "Import Readest upstream as soft-fork baseline"
```

If merge is too painful on an already-initialized repo with only the design doc, instead:

```bash
# backup design docs, clone fresh, restore docs/
```

- [ ] **Step 2: Install and build macOS Tauri app per upstream CONTRIBUTING**

Follow `apps/readest-app` docs. Typical shape:

```bash
cd apps/readest-app
pnpm install
pnpm tauri build   # or pnpm tauri dev
```

Expected: app launches on macOS; can open an EPUB.

- [ ] **Step 3: Commit baseline marker**

```bash
git add README.md
git commit -m "docs: note soft-fork goals for Antigravity and LightRAG"
```

---

### Task 2: Shared Ask + LightRAG types

**Files:**
- Create: `apps/readest-app/src/services/ai/lightrag/types.ts`
- Create: `apps/readest-app/src/services/ai/ask/types.ts`
- Create: `apps/readest-app/src/services/ai/history/types.ts`

**Interfaces:**
- Consumes: none
- Produces: `LightRAGSource`, `LightRAGRetrieveResult`, `AskRequest`, `AskResult`, `QAThread`, `QAMessage`

- [ ] **Step 1: Write types**

```ts
// apps/readest-app/src/services/ai/lightrag/types.ts
export type LightRAGSource = {
  id: string;
  title: string;
  snippet: string;
  score?: number;
  bookId?: string;
  bookTitle?: string;
  entityType?: string;
};

export type LightRAGRetrieveResult = {
  sources: LightRAGSource[];
  contextText?: string;
};
```

```ts
// apps/readest-app/src/services/ai/ask/types.ts
import type { LightRAGSource } from '../lightrag/types';

export type AskMode = 'ask' | 'ask-with-library';

export type AskRequest = {
  mode: AskMode;
  bookHash: string;
  bookTitle: string;
  selectionText: string;
  selectionCfi?: string;
  question: string;
};

export type AskResult = {
  answer: string;
  sources: LightRAGSource[];
  truncatedSelection: boolean;
  truncatedLibrary: boolean;
  grounded: boolean;
};
```

```ts
// apps/readest-app/src/services/ai/history/types.ts
import type { LightRAGSource } from '../lightrag/types';

export type QAThread = {
  id: string;
  bookHash: string;
  bookTitle: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  grounded: boolean;
  selectionCfi?: string;
};

export type QAMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  createdAt: number;
  selectionText?: string;
  sources?: LightRAGSource[];
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/readest-app/src/services/ai/lightrag/types.ts \
        apps/readest-app/src/services/ai/ask/types.ts \
        apps/readest-app/src/services/ai/history/types.ts
git commit -m "feat(ai): add Ask, LightRAG, and history shared types"
```

---

### Task 3: PromptBuilder (TDD)

**Files:**
- Create: `apps/readest-app/src/services/ai/ask/promptBuilder.ts`
- Test: `apps/readest-app/src/__tests__/ai/promptBuilder.test.ts`

**Interfaces:**
- Consumes: `LightRAGRetrieveResult`, `AskRequest` fields
- Produces: `buildAskPrompt(input) => { prompt: string; truncatedSelection: boolean; truncatedLibrary: boolean }`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { buildAskPrompt, SELECTION_CHAR_LIMIT, LIBRARY_CHAR_LIMIT } from '../../services/ai/ask/promptBuilder';

describe('buildAskPrompt', () => {
  it('includes book, selection, and question', () => {
    const result = buildAskPrompt({
      bookTitle: 'Example Book',
      selectionText: 'Some passage',
      question: 'What does this mean?',
      sources: [],
      contextText: undefined,
    });
    expect(result.prompt).toContain('Example Book');
    expect(result.prompt).toContain('Some passage');
    expect(result.prompt).toContain('What does this mean?');
    expect(result.truncatedSelection).toBe(false);
  });

  it('truncates long selection', () => {
    const selectionText = 'x'.repeat(SELECTION_CHAR_LIMIT + 50);
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText,
      question: 'Q',
      sources: [],
    });
    expect(result.truncatedSelection).toBe(true);
    expect(result.prompt.length).toBeLessThan(selectionText.length + 500);
  });

  it('injects library sources and caps library context', () => {
    const contextText = 'y'.repeat(LIBRARY_CHAR_LIMIT + 100);
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText: 'sel',
      question: 'Q',
      sources: [{ id: 's1', title: 'Concept A', snippet: 'about A' }],
      contextText,
    });
    expect(result.prompt).toContain('[s1]');
    expect(result.prompt).toContain('Concept A');
    expect(result.truncatedLibrary).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/promptBuilder.test.ts
```

Expected: FAIL (module missing)

- [ ] **Step 3: Implement**

```ts
// apps/readest-app/src/services/ai/ask/promptBuilder.ts
import type { LightRAGSource } from '../lightrag/types';

export const SELECTION_CHAR_LIMIT = 4000;
export const LIBRARY_CHAR_LIMIT = 8000;

export type PromptBuildInput = {
  bookTitle: string;
  selectionText: string;
  question: string;
  sources: LightRAGSource[];
  contextText?: string;
};

export type PromptBuildResult = {
  prompt: string;
  truncatedSelection: boolean;
  truncatedLibrary: boolean;
};

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + '\n…[truncated]', truncated: true };
}

export function buildAskPrompt(input: PromptBuildInput): PromptBuildResult {
  const sel = truncate(input.selectionText.trim(), SELECTION_CHAR_LIMIT);
  let libraryBlock = '';
  let truncatedLibrary = false;

  if (input.sources.length > 0 || input.contextText) {
    const sourceLines = input.sources
      .slice(0, 8)
      .map((s) => `- [${s.id}] ${s.title}: ${s.snippet}`)
      .join('\n');
    const ctx = truncate(input.contextText ?? '', LIBRARY_CHAR_LIMIT);
    truncatedLibrary = ctx.truncated;
    libraryBlock = `
Library context (cite by [id] when relevant):
${sourceLines}

${ctx.text}
`;
  }

  const prompt = `You are a careful reading assistant. Answer the user's question about the selected passage. Do not invent library sources.

Book: ${input.bookTitle}

Selected passage:
"""
${sel.text}
"""
${libraryBlock}
Question: ${input.question}
`;

  return {
    prompt,
    truncatedSelection: sel.truncated,
    truncatedLibrary,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/promptBuilder.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/ask/promptBuilder.ts \
        apps/readest-app/src/__tests__/ai/promptBuilder.test.ts
git commit -m "feat(ai): add Ask prompt builder with selection and library budgets"
```

---

### Task 4: Antigravity client parser + runner (TDD)

**Files:**
- Create: `apps/readest-app/src/services/ai/ask/antigravityClient.ts`
- Test: `apps/readest-app/src/__tests__/ai/antigravityClient.test.ts`

**Interfaces:**
- Consumes: prompt string, options `{ agyPath: string; timeoutMs: number; runCommand?: typeof runCommand }`
- Produces: `completeWithAntigravity(prompt, opts) => Promise<{ text: string }>`  
  Errors: `AntigravityNotFoundError`, `AntigravityAuthError`, `AntigravityTimeoutError`, `AntigravityExitError`

- [ ] **Step 1: Write failing parser tests**

```ts
import { describe, it, expect } from 'vitest';
import { extractAnswerFromAgyOutput } from '../../services/ai/ask/antigravityClient';

describe('extractAnswerFromAgyOutput', () => {
  it('returns plain text when output is not JSON', () => {
    expect(extractAnswerFromAgyOutput('Hello reader')).toBe('Hello reader');
  });

  it('extracts result text from stream-json final event lines', () => {
    const stdout = [
      '{"type":"assistant","text":"partial"}',
      '{"type":"result","result":"Final answer"}',
    ].join('\n');
    expect(extractAnswerFromAgyOutput(stdout)).toBe('Final answer');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/antigravityClient.test.ts
```

- [ ] **Step 3: Implement client**

```ts
// apps/readest-app/src/services/ai/ask/antigravityClient.ts
export class AntigravityNotFoundError extends Error {
  constructor(path: string) {
    super(`agy not found at ${path}. Install Antigravity CLI and set the path in Settings.`);
    this.name = 'AntigravityNotFoundError';
  }
}
export class AntigravityAuthError extends Error {
  constructor() {
    super('agy is not authenticated. Run `agy` once in a terminal to sign in.');
    this.name = 'AntigravityAuthError';
  }
}
export class AntigravityTimeoutError extends Error {
  constructor() {
    super('agy timed out waiting for a response.');
    this.name = 'AntigravityTimeoutError';
  }
}
export class AntigravityExitError extends Error {
  constructor(code: number, stderr: string) {
    super(`agy exited with code ${code}: ${stderr}`);
    this.name = 'AntigravityExitError';
  }
}

export type RunCommandResult = { code: number; stdout: string; stderr: string };
export type RunCommand = (
  cmd: string,
  args: string[],
  opts: { timeoutMs: number },
) => Promise<RunCommandResult>;

export function extractAnswerFromAgyOutput(stdout: string): string {
  const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let lastResult: string | undefined;
  let lastAssistant = '';
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      const evt = JSON.parse(line) as { type?: string; result?: string; text?: string };
      if (evt.type === 'result' && typeof evt.result === 'string') lastResult = evt.result;
      if (evt.type === 'assistant' && typeof evt.text === 'string') lastAssistant = evt.text;
    } catch {
      // ignore non-JSON lines
    }
  }
  if (lastResult) return lastResult.trim();
  if (lastAssistant) return lastAssistant.trim();
  return stdout.trim();
}

export async function completeWithAntigravity(
  prompt: string,
  opts: { agyPath: string; timeoutMs?: number; runCommand: RunCommand },
): Promise<{ text: string }> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  let result: RunCommandResult;
  try {
    result = await opts.runCommand(
      opts.agyPath,
      [
        '-p',
        prompt,
        '--output-format',
        'stream-json',
        '--sandbox',
        // Prefer denying autonomous edits; adjust flags after probing `agy -p --help`
      ],
      { timeoutMs },
    );
  } catch (e) {
    const msg = String(e);
    if (msg.includes('ENOENT') || msg.toLowerCase().includes('not found')) {
      throw new AntigravityNotFoundError(opts.agyPath);
    }
    if (msg.toLowerCase().includes('timeout')) throw new AntigravityTimeoutError();
    throw e;
  }

  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (combined.includes('authentication required') || combined.includes('not authenticated')) {
    throw new AntigravityAuthError();
  }
  if (result.code !== 0) {
    throw new AntigravityExitError(result.code, result.stderr || result.stdout);
  }
  return { text: extractAnswerFromAgyOutput(result.stdout) };
}
```

Wire `runCommand` in a separate small file using Tauri `plugin-shell` `Command` in Task 5; tests inject a mock.

- [ ] **Step 4: Add runner-injection test**

```ts
it('completeWithAntigravity returns parsed text via injected runner', async () => {
  const { completeWithAntigravity } = await import('../../services/ai/ask/antigravityClient');
  const out = await completeWithAntigravity('Q?', {
    agyPath: '/usr/local/bin/agy',
    runCommand: async () => ({
      code: 0,
      stdout: '{"type":"result","result":"OK"}\n',
      stderr: '',
    }),
  });
  expect(out.text).toBe('OK');
});
```

- [ ] **Step 5: Run tests — PASS, then commit**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/antigravityClient.test.ts
git add apps/readest-app/src/services/ai/ask/antigravityClient.ts \
        apps/readest-app/src/__tests__/ai/antigravityClient.test.ts
git commit -m "feat(ai): add Antigravity headless client and output parser"
```

---

### Task 5: Tauri shell runner + settings for `agy`

**Files:**
- Create: `apps/readest-app/src/services/ai/ask/runCommand.ts`
- Modify: Readest AI / settings UI to store `agyPath` (default `agy`) and `lightragBaseUrl` (default `http://127.0.0.1:8765`)
- Modify: `apps/readest-app/src-tauri/capabilities/*.json` (or equivalent) to allow executing `agy`

**Interfaces:**
- Consumes: `completeWithAntigravity`
- Produces: `tauriRunCommand: RunCommand`; settings keys `agyPath`, `lightragBaseUrl`, `lightragMode`

- [ ] **Step 1: Implement Tauri runner**

```ts
// apps/readest-app/src/services/ai/ask/runCommand.ts
import { Command } from '@tauri-apps/plugin-shell';
import type { RunCommand, RunCommandResult } from './antigravityClient';

export const tauriRunCommand: RunCommand = async (cmd, args, opts) => {
  const command = Command.create(cmd, args);
  const child = await Promise.race([
    command.execute(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), opts.timeoutMs),
    ),
  ]);
  return {
    code: child.code ?? 1,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
  } satisfies RunCommandResult;
};
```

- [ ] **Step 2: Allowlist / sidecar config**

Update Tauri shell allowlist so `agy` can run (exact JSON depends on upstream Tauri v2 capabilities files — mirror how other shell commands are permitted).

- [ ] **Step 3: Settings fields**

Add to the existing AI settings panel (reuse upstream settings persistence patterns):

- `agyPath: string` default `"agy"`
- `lightragBaseUrl: string` default `"http://127.0.0.1:8765"`
- `lightragMode: 'local' | 'global' | 'hybrid' | 'naive'` default `"hybrid"`

- [ ] **Step 4: Manual smoke**

```bash
# terminal
agy -p "ping" --output-format text
# then from app settings, Save, and a tiny debug button or unit integration that calls tauriRunCommand
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(ai): wire Tauri shell runner and Antigravity/LightRAG settings"
```

---

### Task 6: lib-rag `POST /api/retrieve` (sibling repo)

**Files (in `/Users/danemacaulay/projects/lib-rag`):**
- Create: `src/calibre_rag/retrieve.py`
- Create: `tests/test_retrieve.py`
- Modify: `src/calibre_rag/viz/server.py`
- Modify: `src/calibre_rag/cli.py` (optional `retrieve` subcommand)

**Interfaces:**
- Consumes: existing `create_rag`, `QueryParam`, config
- Produces: JSON `{ sources: LightRAGSource[], contextText?: string }`

- [ ] **Step 1: Write failing API-shape unit test for parser helper**

```python
# tests/test_retrieve.py
from calibre_rag.retrieve import sources_from_context

def test_sources_from_context_splits_blocks():
    context = "Entity: Foo\nA concept about Foo.\n\nEntity: Bar\nRelated to Bar."
    sources = sources_from_context(context, limit=8)
    assert len(sources) >= 1
    assert sources[0]["id"]
    assert sources[0]["title"]
    assert sources[0]["snippet"]
```

- [ ] **Step 2: Implement retrieve**

```python
# src/calibre_rag/retrieve.py
from __future__ import annotations

import re
from typing import Any

from lightrag import QueryParam

from calibre_rag.config import Config
from calibre_rag.indexer import create_rag


def sources_from_context(context: str, *, limit: int = 8) -> list[dict[str, Any]]:
    blocks = [b.strip() for b in re.split(r"\n\s*\n", context or "") if b.strip()]
    sources: list[dict[str, Any]] = []
    for i, block in enumerate(blocks[:limit]):
        first, _, rest = block.partition("\n")
        title = first.strip()[:120] or f"source-{i+1}"
        snippet = (rest.strip() or first.strip())[:400]
        sources.append(
            {
                "id": f"s{i+1}",
                "title": title,
                "snippet": snippet,
            }
        )
    return sources


async def retrieve_rag(
    cfg: Config,
    question: str,
    mode: str = "hybrid",
    *,
    verbose: bool = False,
) -> dict[str, Any]:
    rag = await create_rag(cfg, for_query=True)
    try:
        param = QueryParam(
            mode=mode,
            only_need_context=True,
            enable_rerank=cfg.rerank_enabled,
        )
        if cfg.rerank_enabled:
            param.chunk_top_k = cfg.rerank_top_n
        context = await rag.aquery(question, param=param)
        context_text = context if isinstance(context, str) else str(context)
        return {
            "sources": sources_from_context(context_text, limit=8),
            "contextText": context_text,
        }
    finally:
        await rag.finalize_storages()
```

If `only_need_context` is unsupported in the installed LightRAG version, fall back to `only_need_prompt=True` or capture the context field from the richer return type — probe in this task and keep the HTTP response shape stable.

- [ ] **Step 3: Add route**

```python
# in create_app() inside viz/server.py
from pydantic import BaseModel, Field
from calibre_rag.retrieve import retrieve_rag

class RetrieveBody(BaseModel):
    query: str = Field(min_length=1)
    selection: str | None = None
    mode: str = "hybrid"

@app.post("/api/retrieve")
async def retrieve(body: RetrieveBody) -> dict:
    q = body.query
    if body.selection:
        q = f"{body.query}\n\nPassage:\n{body.selection}"
    return await retrieve_rag(cfg, q, body.mode)
```

- [ ] **Step 4: Manual verify**

```bash
cd ~/projects/lib-rag && source .venv/bin/activate
# start viz server as you usually do, then:
curl -s localhost:8765/api/retrieve -H 'content-type: application/json' \
  -d '{"query":"stoicism","selection":"the dichotomy of control","mode":"hybrid"}' | head
```

- [ ] **Step 5: Commit in lib-rag**

```bash
cd ~/projects/lib-rag
git add src/calibre_rag/retrieve.py src/calibre_rag/viz/server.py tests/test_retrieve.py
git commit -m "feat: add /api/retrieve for reader LightRAG grounding"
```

---

### Task 7: LightRAGClient in the reader (TDD)

**Files:**
- Create: `apps/readest-app/src/services/ai/lightrag/client.ts`
- Test: `apps/readest-app/src/__tests__/ai/lightragClient.test.ts`

**Interfaces:**
- Consumes: `lightragBaseUrl`, fetch impl
- Produces: `retrieveFromLightRAG({ query, selection, mode, baseUrl, fetchImpl }) => LightRAGRetrieveResult`  
  Errors: `LightRAGUnreachableError`

- [ ] **Step 1: Failing test with mock fetch**

```ts
import { describe, it, expect, vi } from 'vitest';
import { retrieveFromLightRAG, LightRAGUnreachableError } from '../../services/ai/lightrag/client';

describe('retrieveFromLightRAG', () => {
  it('maps JSON sources', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sources: [{ id: 's1', title: 'T', snippet: 'S' }],
          contextText: 'ctx',
        }),
        { status: 200 },
      ),
    );
    const result = await retrieveFromLightRAG({
      baseUrl: 'http://127.0.0.1:8765',
      query: 'q',
      selection: 'sel',
      mode: 'hybrid',
      fetchImpl,
    });
    expect(result.sources[0].id).toBe('s1');
    expect(result.contextText).toBe('ctx');
  });

  it('throws unreachable on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      retrieveFromLightRAG({
        baseUrl: 'http://127.0.0.1:8765',
        query: 'q',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(LightRAGUnreachableError);
  });
});
```

- [ ] **Step 2: Implement client**

```ts
// apps/readest-app/src/services/ai/lightrag/client.ts
import type { LightRAGRetrieveResult } from './types';

export class LightRAGUnreachableError extends Error {
  constructor(baseUrl: string) {
    super(`LightRAG server unreachable at ${baseUrl}. Start lib-rag, or use Ask without library.`);
    this.name = 'LightRAGUnreachableError';
  }
}

export async function retrieveFromLightRAG(opts: {
  baseUrl: string;
  query: string;
  selection?: string;
  mode?: string;
  fetchImpl?: typeof fetch;
}): Promise<LightRAGRetrieveResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/retrieve`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: opts.query,
        selection: opts.selection,
        mode: opts.mode ?? 'hybrid',
      }),
    });
  } catch {
    throw new LightRAGUnreachableError(opts.baseUrl);
  }
  if (!res.ok) {
    throw new LightRAGUnreachableError(opts.baseUrl);
  }
  return (await res.json()) as LightRAGRetrieveResult;
}
```

- [ ] **Step 3: Tests PASS + commit**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/lightragClient.test.ts
git add apps/readest-app/src/services/ai/lightrag/client.ts \
        apps/readest-app/src/__tests__/ai/lightragClient.test.ts
git commit -m "feat(ai): add LightRAG HTTP retrieve client"
```

---

### Task 8: AskService orchestration (TDD)

**Files:**
- Create: `apps/readest-app/src/services/ai/ask/askService.ts`
- Test: `apps/readest-app/src/__tests__/ai/askService.test.ts`

**Interfaces:**
- Consumes: `buildAskPrompt`, `completeWithAntigravity`, `retrieveFromLightRAG`, `HistoryStore` (inject save stub until Task 10)
- Produces: `runAsk(request, deps) => AskResult`

- [ ] **Step 1: Failing tests**

```ts
import { describe, it, expect, vi } from 'vitest';
import { runAsk } from '../../services/ai/ask/askService';

describe('runAsk', () => {
  it('ask mode skips retrieve', async () => {
    const retrieve = vi.fn();
    const complete = vi.fn(async () => ({ text: 'A' }));
    const result = await runAsk(
      {
        mode: 'ask',
        bookHash: 'h1',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      {
        retrieve,
        complete: complete as any,
        agyPath: 'agy',
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
      },
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(result.answer).toBe('A');
    expect(result.grounded).toBe(false);
    expect(result.sources).toEqual([]);
  });

  it('ask-with-library retrieves then completes', async () => {
    const retrieve = vi.fn(async () => ({
      sources: [{ id: 's1', title: 'T', snippet: 'S' }],
      contextText: 'ctx',
    }));
    const complete = vi.fn(async () => ({ text: 'Grounded' }));
    const result = await runAsk(
      {
        mode: 'ask-with-library',
        bookHash: 'h1',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      {
        retrieve,
        complete: complete as any,
        agyPath: 'agy',
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
      },
    );
    expect(retrieve).toHaveBeenCalled();
    expect(result.grounded).toBe(true);
    expect(result.sources[0].id).toBe('s1');
    expect(result.answer).toBe('Grounded');
  });
});
```

- [ ] **Step 2: Implement `runAsk`**

```ts
// apps/readest-app/src/services/ai/ask/askService.ts
import { buildAskPrompt } from './promptBuilder';
import type { AskRequest, AskResult } from './types';
import type { LightRAGRetrieveResult } from '../lightrag/types';
import { completeWithAntigravity, type RunCommand } from './antigravityClient';

export type AskDeps = {
  retrieve: (args: {
    baseUrl: string;
    query: string;
    selection?: string;
    mode?: string;
  }) => Promise<LightRAGRetrieveResult>;
  complete: typeof completeWithAntigravity;
  runCommand?: RunCommand;
  agyPath: string;
  lightragBaseUrl: string;
  lightragMode: string;
};

export async function runAsk(req: AskRequest, deps: AskDeps): Promise<AskResult> {
  let sources: LightRAGRetrieveResult['sources'] = [];
  let contextText: string | undefined;
  let grounded = false;

  if (req.mode === 'ask-with-library') {
    const retrieved = await deps.retrieve({
      baseUrl: deps.lightragBaseUrl,
      query: req.question,
      selection: req.selectionText,
      mode: deps.lightragMode,
    });
    sources = retrieved.sources ?? [];
    contextText = retrieved.contextText;
    grounded = true;
  }

  const built = buildAskPrompt({
    bookTitle: req.bookTitle,
    selectionText: req.selectionText,
    question: req.question,
    sources,
    contextText,
  });

  const { text } = await deps.complete(built.prompt, {
    agyPath: deps.agyPath,
    runCommand: deps.runCommand!,
  });

  return {
    answer: text,
    sources,
    truncatedSelection: built.truncatedSelection,
    truncatedLibrary: built.truncatedLibrary,
    grounded,
  };
}
```

- [ ] **Step 3: PASS + commit**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/askService.test.ts
git add apps/readest-app/src/services/ai/ask/askService.ts \
        apps/readest-app/src/__tests__/ai/askService.test.ts
git commit -m "feat(ai): orchestrate Ask and Ask with library"
```

---

### Task 9: Selection actions + Ask UI + source chips

**Files:**
- Modify: Readest selection popup / annotation menu (locate upstream highlight popup component under `apps/readest-app/src/components` — typically reader selection toolbar)
- Create: `apps/readest-app/src/components/ask/AskComposer.tsx`
- Create: `apps/readest-app/src/components/ask/AskPanel.tsx`
- Create: `apps/readest-app/src/components/ask/SourceChips.tsx`

**Interfaces:**
- Consumes: `runAsk`, settings, book hash/title, selection text/CFI
- Produces: user-visible Ask / Ask with library flow

- [ ] **Step 1: SourceChips component**

```tsx
// apps/readest-app/src/components/ask/SourceChips.tsx
import type { LightRAGSource } from '@/services/ai/lightrag/types';

export function SourceChips({ sources }: { sources: LightRAGSource[] }) {
  if (!sources.length) {
    return <p className="text-sm opacity-70">No library sources</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {sources.map((s) => (
        <li key={s.id} title={s.snippet} className="rounded border px-2 py-1 text-xs">
          [{s.id}] {s.title}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Add menu actions**

In the selection popup, add:

- **Ask** → open AskComposer with `mode: 'ask'`
- **Ask with library** → open AskComposer with `mode: 'ask-with-library'`

On submit, call `runAsk` with `tauriRunCommand` + `retrieveFromLightRAG`, render answer in `AskPanel`, show `SourceChips` when `grounded`.

Error mapping:

- `AntigravityNotFoundError` / `Auth` / `Timeout` → error bubble with exact message
- `LightRAGUnreachableError` → offer button “Ask without library”

- [ ] **Step 3: Manual test on macOS**

1. `agy` signed in  
2. Open EPUB, highlight, Ask → answer appears  
3. Stop lib-rag, Ask with library → unreachable + fallback  
4. Start lib-rag, Ask with library → chips + answer  

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(ai): add selection Ask actions, panel, and source chips"
```

---

### Task 10: HistoryStore persistence + search (TDD)

**Files:**
- Create: `apps/readest-app/src/services/ai/history/historyStore.ts`
- Test: `apps/readest-app/src/__tests__/ai/historyStore.test.ts`
- Modify: `askService` call sites / AskPanel to save after each finalized turn

**Interfaces:**
- Consumes: `QAThread`, `QAMessage`
- Produces:
  - `saveTurn(...)`
  - `searchThreads(query: string): QAThread[]`
  - `listRecent(limit: number): QAThread[]`
  - `getMessages(threadId: string): QAMessage[]`
  - `deleteThread(threadId: string): void`

Storage v1: JSON file under app data via existing Readest persistence helpers **or** a dedicated SQLite table if `nativeDatabaseService` is the established pattern. Prefer one JSON/SQLite store keyed globally (not per-book file only).

- [ ] **Step 1: In-memory store tests first (logic), then file adapter**

```ts
import { describe, it, expect } from 'vitest';
import { createMemoryHistoryStore } from '../../services/ai/history/historyStore';

describe('historyStore', () => {
  it('saves turns and searches across books', async () => {
    const store = createMemoryHistoryStore();
    await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'What is virtue?',
      answer: 'Excellence of character',
      selectionText: 'arete',
      selectionCfi: 'epubcfi(/6/4)',
      sources: [],
      grounded: false,
    });
    await store.saveTurn({
      bookHash: 'b',
      bookTitle: 'Beta',
      question: 'Stoic assent',
      answer: 'Judgment',
      selectionText: 'synkatathesis',
      grounded: true,
      sources: [{ id: 's1', title: 'Assent', snippet: '...' }],
    });
    const hits = await store.searchThreads('virtue');
    expect(hits).toHaveLength(1);
    expect(hits[0].bookTitle).toBe('Alpha');
    const all = await store.searchThreads('stoic');
    expect(all[0].grounded).toBe(true);
  });
});
```

- [ ] **Step 2: Implement memory + persistent adapters**

Search v1 algorithm (explicit): case-insensitive `includes` over `thread.title`, `thread.bookTitle`, and all message `content` fields. Upgrade to FTS later if needed.

On AskPanel success/error finalize:

```ts
await historyStore.saveTurn({
  bookHash,
  bookTitle,
  question,
  answer: result.answer,
  selectionText,
  selectionCfi,
  sources: result.sources,
  grounded: result.grounded,
});
```

History write failures: `console.warn` + toast; do not fail the visible answer.

- [ ] **Step 3: PASS + commit**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/historyStore.test.ts
git commit -am "feat(ai): persist Ask turns in searchable global history store"
```

---

### Task 11: Global Questions history UI + jump-to-book

**Files:**
- Create: `apps/readest-app/src/app/library/questions/page.tsx` (or match upstream library routing patterns)
- Create: `apps/readest-app/src/components/ask/HistoryList.tsx`
- Modify: library nav to link “Questions”
- Modify: reader open-book navigation to accept `bookHash` + optional `cfi` + `threadId`

**Interfaces:**
- Consumes: `historyStore.searchThreads`, `getMessages`, library/book open APIs
- Produces: browsable history + restore thread in AskPanel

- [ ] **Step 1: History list UI**

Show rows: title, bookTitle, relative time, grounded badge. Search input debounced 200ms calling `searchThreads`.

- [ ] **Step 2: Open entry**

1. Resolve book by `bookHash` in library  
2. If missing → show read-only transcript modal with message “Book file not found”  
3. If present → navigate to reader, scroll to `selectionCfi` when available, load messages into AskPanel  

- [ ] **Step 3: Delete / clear**

Per-thread delete; “Clear all” with confirm dialog.

- [ ] **Step 4: Manual E2E**

Ask in book A, Ask with library in book B, quit app, relaunch, search, jump back.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(ai): add global Questions history with jump-to-book"
```

---

### Task 12: End-to-end verification checklist

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-readest-antigravity-lightrag-design.md` status → Implemented (only after checklist passes)
- Create: `docs/superpowers/plans/2026-10-03-readest-antigravity-lightrag-verification.md` (optional short notes)

- [ ] **Step 1: Run automated tests**

```bash
cd apps/readest-app && pnpm exec vitest run src/__tests__/ai
cd ~/projects/lib-rag && source .venv/bin/activate && pytest tests/test_retrieve.py -v
```

Expected: all PASS

- [ ] **Step 2: Manual success criteria**

1. Open EPUB on macOS forked reader  
2. Highlight → Ask → Antigravity answer  
3. Highlight → Ask with library → chips + grounded answer  
4. Quit/reopen → global search finds Q&A → jump to book/thread  
5. `agy` missing / lib-rag down → actionable errors  

- [ ] **Step 3: Final commit**

```bash
git commit -am "docs: record v1 Ask verification results"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|---|---|
| Soft-fork Readest macOS | Task 1 |
| Highlight Ask via Antigravity | Tasks 4–5, 8–9 |
| Opt-in Ask with library | Tasks 6–9 |
| Source chips from retrieve | Tasks 6–7, 9 |
| Global searchable history + jump-to-book | Tasks 10–11 |
| Error handling table | Tasks 4, 7, 9–11 |
| Unit/integration/manual tests | Tasks 3–4, 7–8, 10, 12 |
| AGPL additive modules | All tasks under `services/ai` / `components/ask` |
| No Reedy / no graph viz / no cloud sync | Honored by omission |

## Plan decisions (resolved from spec open items)

- lib-rag route: **`POST /api/retrieve`** on viz server (port 8765)
- Antigravity sessions: **one-shot** `-p` with full prompt (no `--conversation` in v1)
- Budgets: **4000 / 8000 / top 8**
- History search: **substring includes** first; FTS later if needed
- Antigravity integration: **dedicated AskService**, not a fake Vercel `LanguageModel` wrapper in v1
