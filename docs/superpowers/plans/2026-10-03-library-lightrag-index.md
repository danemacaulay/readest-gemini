# Library → LightRAG Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user right-click a Calibre-backed book in Readest, tag it `rag-index` in the local Calibre library, run `calibre-rag index --id`, and see a cover badge for not indexed / indexing / indexed.

**Architecture:** Thin Readest shell-out to `calibredb` + `calibre-rag` (same pattern as `agy`). lib-rag gains `paths.local_library` so catalog + book files come from the Mac Calibre tree (no Pi). Badge state = one-shot indexed-id set from `GET /api/books` merged with in-memory in-flight jobs.

**Tech Stack:** Readest (Next.js + Tauri v2, TypeScript, Vitest), sibling `~/projects/lib-rag` (Python 3.11, pytest), Calibre `calibredb`, `calibre-rag` CLI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-10-03-library-lightrag-index-design.md`
- Platform: macOS desktop (Tauri) only for v1
- No bulk / select-mode indexing
- Tag `rag-index` before every index
- Local Calibre is source of truth (Pi sync remains as unused fallback when `local_library` unset)
- “Indexing” badge only for jobs this app started (no LightRAG polling loop)
- Cover corner badge; context menu only (no bulk toolbar)
- Two repos: reader commits here; lib-rag commits in `~/projects/lib-rag`

---

## File structure (target)

```
# reader
apps/readest-app/src/services/ai/lightrag/
  calibrePath.ts          # parseCalibreBookId, mergeRagIndexTags
  indexStatus.ts          # fetchIndexedIds, badgeState reducer + small store
  indexJob.ts             # tag + index orchestration
  shellScopes.ts          # resolve calibredb / calibre-rag allowlist names

apps/readest-app/src/__tests__/ai/
  calibrePath.test.ts
  indexStatus.test.ts
  indexJob.test.ts

apps/readest-app/src/services/ai/types.ts          # + settings keys
apps/readest-app/src/services/ai/constants.ts      # defaults
apps/readest-app/src/components/settings/AIPanel.tsx
apps/readest-app/src-tauri/capabilities/default.json

apps/readest-app/src/app/library/utils/libraryUtils.ts   # menu id
apps/readest-app/src/app/library/components/BookshelfItem.tsx
apps/readest-app/src/app/library/components/BookItem.tsx
apps/readest-app/src/__tests__/app/library/book-context-menu.test.ts

# lib-rag (sibling)
src/calibre_rag/config.py
src/calibre_rag/sync.py
config.yaml / config.example.yaml
tests/test_local_library.py
```

---

### Task 1: lib-rag local library mode

**Files (in `/Users/danemacaulay/projects/lib-rag`):**
- Modify: `src/calibre_rag/config.py`
- Modify: `src/calibre_rag/sync.py`
- Modify: `config.yaml`, `config.example.yaml`
- Test: `tests/test_local_library.py`

**Interfaces:**
- Consumes: existing `Config`, `sync_catalog`, `sync_book_folder`
- Produces: `Config.local_library: Path | None`; when set, `sync_catalog` copies local `metadata.db` (no SSH); `sync_book_folder` reads `{local_library}/{book.path}` (no scp)

- [ ] **Step 1: Write the failing test**

```python
# tests/test_local_library.py
from pathlib import Path
import shutil
import sqlite3

from calibre_rag.config import Config
from calibre_rag.sync import sync_catalog, sync_book_folder
from calibre_rag.catalog import BookRecord


def test_sync_catalog_copies_local_metadata(tmp_path: Path, monkeypatch):
    lib = tmp_path / "calibre"
    lib.mkdir()
    src_db = lib / "metadata.db"
    # minimal sqlite file
    conn = sqlite3.connect(src_db)
    conn.execute("CREATE TABLE books (id INTEGER PRIMARY KEY)")
    conn.close()

    cache = tmp_path / "cache" / "metadata.db"
    cfg = Config(local_library=lib, catalog_cache=cache)

    def boom(*_a, **_k):
        raise AssertionError("scp must not run in local mode")

    monkeypatch.setattr("calibre_rag.sync.subprocess.run", boom)
    sync_catalog(cfg)
    assert cache.exists()
    assert cache.read_bytes() == src_db.read_bytes()


def test_sync_book_folder_uses_local_library(tmp_path: Path, monkeypatch):
    lib = tmp_path / "calibre"
    book_dir = lib / "Author" / "Title (42)"
    book_dir.mkdir(parents=True)
    epub = book_dir / "Title - Author.epub"
    epub.write_bytes(b"PK\x03\x04fake")

    cfg = Config(local_library=lib, library_mirror=tmp_path / "mirror")

    def boom(*_a, **_k):
        raise AssertionError("scp must not run in local mode")

    monkeypatch.setattr("calibre_rag.sync.subprocess.run", boom)

    book = BookRecord(
        book_id=42,
        title="Title",
        authors="Author",
        path="Author/Title (42)",
        tags=["rag-index"],
        formats=["EPUB"],
        epub_file="Title - Author",
    )
    path, fmt = sync_book_folder(cfg, book)
    assert fmt == "EPUB"
    assert path == epub
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/projects/lib-rag && source .venv/bin/activate && pytest tests/test_local_library.py -v`  
Expected: FAIL (no `local_library` on Config)

- [ ] **Step 3: Implement Config.local_library**

In `config.py`, add field:

```python
local_library: Path | None = None
```

In `Config.load`, after reading `paths`:

```python
raw_local = paths.get("local_library") or ""
local_library = Path(raw_local).expanduser() if raw_local else None
# If relative, resolve against REPO_ROOT; if absolute, keep absolute.
if local_library and not local_library.is_absolute():
    local_library = (REPO_ROOT / local_library).resolve()
```

Pass `local_library=local_library` into the `cls(...)` constructor.

Also fix path loading so absolute `catalog_cache` / etc. still work if already absolute — for this task only `local_library` must accept absolute paths (Drive library).

- [ ] **Step 4: Implement sync_catalog / sync_book_folder local branches**

```python
# sync.py
import shutil

def sync_catalog(cfg: Config) -> None:
    cfg.catalog_cache.parent.mkdir(parents=True, exist_ok=True)
    if cfg.local_library:
        src = cfg.local_library / "metadata.db"
        if not src.exists():
            raise FileNotFoundError(f"Local Calibre metadata.db not found: {src}")
        shutil.copy2(src, cfg.catalog_cache)
        return
    remote = f"{cfg.ssh_host}:{cfg.remote_library}/metadata.db"
    subprocess.run(["scp", remote, str(cfg.catalog_cache)], check=True)


def sync_book_folder(cfg: Config, book: BookRecord) -> tuple[Path, str]:
    if cfg.local_library:
        local_dir = cfg.local_library / book.path
        return resolve_book_file(local_dir, book, cfg.preferred_formats)

    local_dir = cfg.library_mirror / book.path
    # ... existing Pi scp logic unchanged ...
```

- [ ] **Step 5: Update config.yaml / config.example.yaml**

```yaml
paths:
  # When set, catalog + book files come from this Calibre library (no Pi sync).
  local_library: "/Users/danemacaulay/My Drive/Books/calibre"
  library_mirror: ./cache/calibre-library
  catalog_cache: ./cache/metadata.db
  # ...
```

In `config.example.yaml` use a commented placeholder path.

- [ ] **Step 6: Run tests**

Run: `cd ~/projects/lib-rag && source .venv/bin/activate && pytest tests/test_local_library.py -v`  
Expected: PASS

- [ ] **Step 7: Commit in lib-rag**

```bash
cd ~/projects/lib-rag
git add src/calibre_rag/config.py src/calibre_rag/sync.py config.yaml config.example.yaml tests/test_local_library.py
git commit -m "feat: local Calibre library mode (skip Pi sync)"
```

---

### Task 2: Pure helpers — Calibre id, tag merge, badge state

**Files:**
- Create: `apps/readest-app/src/services/ai/lightrag/calibrePath.ts`
- Create: `apps/readest-app/src/services/ai/lightrag/indexStatus.ts` (pure helpers first; store wired in Task 4)
- Test: `apps/readest-app/src/__tests__/ai/calibrePath.test.ts`
- Test: `apps/readest-app/src/__tests__/ai/indexStatus.test.ts`

**Interfaces:**
- Produces:
  - `parseCalibreBookId(filePath: string | undefined | null): number | null`
  - `mergeRagIndexTags(existingTags: string[]): string`
  - `type LightRAGIndexBadge = 'none' | 'indexing' | 'indexed'`
  - `badgeState(bookId: number, indexed: Set<number>, inFlight: Set<number>): LightRAGIndexBadge`
  - `RAG_INDEX_TAG = 'rag-index'`

- [ ] **Step 1: Write failing tests**

```typescript
// apps/readest-app/src/__tests__/ai/calibrePath.test.ts
import { describe, expect, it } from 'vitest';
import { mergeRagIndexTags, parseCalibreBookId } from '@/services/ai/lightrag/calibrePath';

describe('parseCalibreBookId', () => {
  it('parses id from Calibre folder segment', () => {
    expect(
      parseCalibreBookId(
        '/Users/x/My Drive/Books/calibre/Jean Baudrillard/Simulacra and Simulation (958)/Simulacra and Simulation - Jean Baudrillard.epub',
      ),
    ).toBe(958);
  });

  it('returns null when no id segment', () => {
    expect(parseCalibreBookId('/tmp/Books/hash/book.epub')).toBeNull();
    expect(parseCalibreBookId(undefined)).toBeNull();
  });
});

describe('mergeRagIndexTags', () => {
  it('appends rag-index and dedupes', () => {
    expect(mergeRagIndexTags(['Philosophy', 'rag-index'])).toBe('Philosophy, rag-index');
    expect(mergeRagIndexTags(['History'])).toBe('History, rag-index');
    expect(mergeRagIndexTags([])).toBe('rag-index');
  });
});
```

```typescript
// apps/readest-app/src/__tests__/ai/indexStatus.test.ts
import { describe, expect, it } from 'vitest';
import { badgeState } from '@/services/ai/lightrag/indexStatus';

describe('badgeState', () => {
  it('prefers indexing over indexed', () => {
    expect(badgeState(1, new Set([1]), new Set([1]))).toBe('indexing');
  });
  it('returns indexed when present and not in flight', () => {
    expect(badgeState(1, new Set([1]), new Set())).toBe('indexed');
  });
  it('returns none otherwise', () => {
    expect(badgeState(2, new Set([1]), new Set())).toBe('none');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/calibrePath.test.ts src/__tests__/ai/indexStatus.test.ts`  
Expected: FAIL module not found

- [ ] **Step 3: Implement helpers**

```typescript
// calibrePath.ts
export const RAG_INDEX_TAG = 'rag-index';

/** Calibre stores books under `Author/Title (BOOK_ID)/file.ext`. */
export function parseCalibreBookId(filePath: string | undefined | null): number | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/[^/]+ \((\d+)\)\/[^/]+$/);
  if (!match) return null;
  const id = Number.parseInt(match[1]!, 10);
  return Number.isFinite(id) ? id : null;
}

export function mergeRagIndexTags(existingTags: string[]): string {
  const tags = existingTags.map((t) => t.trim()).filter(Boolean);
  if (!tags.some((t) => t.toLowerCase() === RAG_INDEX_TAG)) {
    tags.push(RAG_INDEX_TAG);
  }
  // de-dupe preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join(', ');
}
```

```typescript
// indexStatus.ts (pure section)
export type LightRAGIndexBadge = 'none' | 'indexing' | 'indexed';

export function badgeState(
  bookId: number,
  indexed: Set<number>,
  inFlight: Set<number>,
): LightRAGIndexBadge {
  if (inFlight.has(bookId)) return 'indexing';
  if (indexed.has(bookId)) return 'indexed';
  return 'none';
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd apps/readest-app && pnpm exec vitest run src/__tests__/ai/calibrePath.test.ts src/__tests__/ai/indexStatus.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/lightrag/calibrePath.ts \
  apps/readest-app/src/services/ai/lightrag/indexStatus.ts \
  apps/readest-app/src/__tests__/ai/calibrePath.test.ts \
  apps/readest-app/src/__tests__/ai/indexStatus.test.ts
git commit -m "feat(ai): parse Calibre book ids and LightRAG badge state"
```

---

### Task 3: Settings + Tauri shell allowlist

**Files:**
- Modify: `apps/readest-app/src/services/ai/types.ts`
- Modify: `apps/readest-app/src/services/ai/constants.ts`
- Modify: `apps/readest-app/src/components/settings/AIPanel.tsx`
- Modify: `apps/readest-app/src-tauri/capabilities/default.json`
- Create: `apps/readest-app/src/services/ai/lightrag/shellScopes.ts`
- Test: `apps/readest-app/src/__tests__/ai/shellScopes.test.ts`

**Interfaces:**
- Produces settings keys on `AISettings`:
  - `calibreLibraryPath: string`
  - `calibreRagCmd: string`
  - `calibredbPath: string`
- Shell allowlist names: `calibredb`, `calibre-rag` (+ absolute defaults)
- `resolveCalibreShellScope(kind, configuredPath): string` → allowlist `name` for `Command.create`

- [ ] **Step 1: Extend AISettings + defaults**

```typescript
// types.ts — add to AISettings
calibreLibraryPath: string;
calibreRagCmd: string;
calibredbPath: string;
```

```typescript
// constants.ts — add to DEFAULT_AI_SETTINGS
calibreLibraryPath: '', // user fills; placeholder hint in UI
calibreRagCmd: 'calibre-rag',
calibredbPath: '/Applications/calibre.app/Contents/MacOS/calibredb',
```

- [ ] **Step 2: Shell scopes helper + test**

```typescript
// shellScopes.ts
export const CALIBREDB_SCOPE = 'calibredb';
export const CALIBRE_RAG_SCOPE = 'calibre-rag';

export function resolveCalibreShellScope(
  kind: 'calibredb' | 'calibre-rag',
  configured: string,
): string {
  const trimmed = (configured || '').trim();
  if (kind === 'calibredb') {
    if (!trimmed || trimmed.endsWith('/calibredb') || trimmed === 'calibredb') {
      return CALIBREDB_SCOPE;
    }
    return trimmed; // custom allowlist name
  }
  // calibre-rag
  if (!trimmed || trimmed.endsWith('/calibre-rag') || trimmed === 'calibre-rag') {
    return CALIBRE_RAG_SCOPE;
  }
  return trimmed;
}
```

Test mapping of empty / basename / absolute default → scope constants.

- [ ] **Step 3: Allowlist in capabilities**

In both `shell:allow-spawn` and `shell:allow-execute` `allow` arrays in `default.json`, add:

```json
{
  "name": "calibredb",
  "cmd": "/Applications/calibre.app/Contents/MacOS/calibredb",
  "args": true
},
{
  "name": "calibre-rag",
  "cmd": "calibre-rag",
  "args": true
},
{
  "name": "calibre-rag-venv",
  "cmd": "/Users/danemacaulay/projects/lib-rag/.venv/bin/calibre-rag",
  "args": true
}
```

Note: `calibre-rag-venv` is the reliable absolute entry for this machine; UI default `calibreRagCmd` may be set to that path and `resolveCalibreShellScope` should map that absolute path to `calibre-rag-venv` (extend the resolver accordingly).

Update resolver:

```typescript
const VENV_CALIBRE_RAG = '/Users/danemacaulay/projects/lib-rag/.venv/bin/calibre-rag';

export function resolveCalibreShellScope(kind: 'calibredb' | 'calibre-rag', configured: string): string {
  const trimmed = (configured || '').trim();
  if (kind === 'calibredb') {
    if (!trimmed || trimmed === CALIBREDB_SCOPE || trimmed.endsWith('/calibredb')) {
      return CALIBREDB_SCOPE;
    }
    return trimmed;
  }
  if (!trimmed || trimmed === CALIBRE_RAG_SCOPE || trimmed.endsWith('/calibre-rag')) {
    if (trimmed === VENV_CALIBRE_RAG) return 'calibre-rag-venv';
    if (!trimmed || trimmed === CALIBRE_RAG_SCOPE) return CALIBRE_RAG_SCOPE;
    if (trimmed.endsWith('/calibre-rag') && trimmed.includes('/lib-rag/')) return 'calibre-rag-venv';
    return CALIBRE_RAG_SCOPE;
  }
  if (trimmed === VENV_CALIBRE_RAG || trimmed.includes('/lib-rag/.venv/bin/calibre-rag')) {
    return 'calibre-rag-venv';
  }
  return trimmed;
}
```

Keep the logic tight in implementation; tests lock behavior for: `''`, `'calibre-rag'`, venv absolute path → `calibre-rag-venv`.

- [ ] **Step 4: AIPanel fields**

Add three text inputs under the existing LightRAG / Antigravity section (same save pattern as `agyPath`):

- Calibre library path
- calibredb path
- calibre-rag command

Default `calibreRagCmd` in UI hint: `/Users/danemacaulay/projects/lib-rag/.venv/bin/calibre-rag`

Also extend `mergeAgyPathEnv` usage OR add `mergeCalibreRagPathEnv` in `runCommand` spawn env to prepend:

- `/Users/danemacaulay/projects/lib-rag/.venv/bin`
- `/Applications/calibre.app/Contents/MacOS`

so the bare `calibre-rag` / PATH resolves when the venv is on disk.

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/services/ai/types.ts \
  apps/readest-app/src/services/ai/constants.ts \
  apps/readest-app/src/services/ai/lightrag/shellScopes.ts \
  apps/readest-app/src/__tests__/ai/shellScopes.test.ts \
  apps/readest-app/src/components/settings/AIPanel.tsx \
  apps/readest-app/src-tauri/capabilities/default.json
git commit -m "feat(ai): settings and shell allowlist for Calibre LightRAG index"
```

---

### Task 4: indexStatus fetch + in-flight store

**Files:**
- Modify: `apps/readest-app/src/services/ai/lightrag/indexStatus.ts`
- Test: `apps/readest-app/src/__tests__/ai/indexStatus.test.ts` (extend)

**Interfaces:**
- Produces:
  - `fetchIndexedBookIds(baseUrl, fetchImpl?): Promise<Set<number>>` — `GET {baseUrl}/api/books`, collect `book_id` where `status` is indexed-like (`indexed` / non-empty); on network error return empty Set (no throw)
  - Module store (event/simple listeners or zustand-free callbacks):
    - `getIndexedIds(): Set<number>`
    - `getInFlightIds(): Set<number>`
    - `setInFlight(id, active: boolean): void`
    - `markIndexed(id: number): void`
    - `refreshIndexedIds(baseUrl): Promise<void>`
    - `subscribe(listener): unsubscribe`
  - `badgeForBookId(id: number): LightRAGIndexBadge`

- [ ] **Step 1: Failing test for fetchIndexedBookIds**

```typescript
it('parses book ids from /api/books', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify([{ book_id: 10, status: 'indexed' }, { book_id: 11, status: '' }]), {
      status: 200,
    });
  const ids = await fetchIndexedBookIds('http://127.0.0.1:8765', fetchImpl as typeof fetch);
  expect([...ids].sort()).toEqual([10, 11]);
});

it('returns empty set when unreachable', async () => {
  const fetchImpl = async () => {
    throw new Error('network');
  };
  await expect(fetchIndexedBookIds('http://127.0.0.1:8765', fetchImpl as typeof fetch)).resolves.toEqual(
    new Set(),
  );
});
```

Treat any book listed by `/api/books` as indexed (manifest-backed list already means present).

- [ ] **Step 2: Implement fetch + store**

Keep store module-scoped (single listener set). `setInFlight` / `markIndexed` notify subscribers so React badges re-render.

- [ ] **Step 3: Run tests — PASS**

- [ ] **Step 4: Commit**

```bash
git add apps/readest-app/src/services/ai/lightrag/indexStatus.ts \
  apps/readest-app/src/__tests__/ai/indexStatus.test.ts
git commit -m "feat(ai): LightRAG indexed-id fetch and in-flight store"
```

---

### Task 5: indexJob — tag + index orchestration

**Files:**
- Create: `apps/readest-app/src/services/ai/lightrag/indexJob.ts`
- Test: `apps/readest-app/src/__tests__/ai/indexJob.test.ts`
- Modify: `apps/readest-app/src/services/ai/ask/runCommand.ts` — export a general `tauriRunShellCommand(scopeName, args, opts)` that does **not** force `resolveAgyShellScope`, OR pass pre-resolved scope names from indexJob

**Interfaces:**
- Consumes: `parseCalibreBookId`, `mergeRagIndexTags`, `resolveCalibreShellScope`, `RunCommand`, indexStatus store
- Produces:
  - `ensureRagIndexTag(opts): Promise<void>`
  - `runLightRAGIndexJob(opts): Promise<void>`
  - Errors: `CalibreTagError`, `LightRAGIndexError` with message for toasts

`runLightRAGIndexJob` steps:
1. Resolve `bookId` from `filePath`; throw if null
2. If already in-flight → return
3. `setInFlight(id, true)`
4. `calibredb show_metadata <id>` → parse `Tags` line → `mergeRagIndexTags` → `set_metadata <id> --field tags:<merged>`
5. `calibre-rag index --id <id>` with `timeoutMs` ≥ 30 minutes (`1_800_000`)
6. On success: `setInFlight(false)`, `markIndexed(id)`, optional `refreshIndexedIds`
7. On failure: `setInFlight(false)`, rethrow

Parse Tags from show_metadata stdout:

```typescript
export function parseCalibreTagsFromMetadata(stdout: string): string[] {
  for (const line of stdout.split(/\r?\n/)) {
    if (/^Tags\s*:/i.test(line)) {
      const rest = line.split(':').slice(1).join(':');
      return rest.split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return [];
}
```

- [ ] **Step 1: Write failing unit tests with mocked RunCommand**

Cover: missing id; tag then index happy path; tag failure skips index; index non-zero throws; concurrent no-op.

- [ ] **Step 2: Implement indexJob.ts**

calibredb args:

```
--with-library=<calibreLibraryPath>
show_metadata
<id>
```

```
--with-library=<calibreLibraryPath>
set_metadata
<id>
--field
tags:<merged>
```

calibre-rag args: `['index', '--id', String(id)]`

Use resolved shell scopes with `tauriRunCommand` after generalizing scope resolution (indexJob passes scope name as `cmd` argument that already matches allowlist `name`).

- [ ] **Step 3: Run tests — PASS**

- [ ] **Step 4: Commit**

```bash
git add apps/readest-app/src/services/ai/lightrag/indexJob.ts \
  apps/readest-app/src/__tests__/ai/indexJob.test.ts \
  apps/readest-app/src/services/ai/ask/runCommand.ts
git commit -m "feat(ai): Calibre tag + calibre-rag index job runner"
```

---

### Task 6: Library UI — context menu + cover badge

**Files:**
- Modify: `apps/readest-app/src/app/library/utils/libraryUtils.ts`
- Modify: `apps/readest-app/src/app/library/components/BookshelfItem.tsx`
- Modify: `apps/readest-app/src/app/library/components/BookItem.tsx`
- Modify: `apps/readest-app/src/__tests__/app/library/book-context-menu.test.ts`
- Optional: tiny `LightRAGIndexBadge.tsx` next to BookItem if cleaner

**Interfaces:**
- Menu id: `'indexLightRAG'`
- Show when `isTauriAppPlatform() && parseCalibreBookId(book.filePath) != null`
- Labels:
  - indexing → `Indexing in LightRAG…` (action no-op)
  - indexed → `Re-index in LightRAG`
  - none → `Add to LightRAG index`
- Action: call `runLightRAGIndexJob` with settings from `useSettingsStore`; toast on error/success via `eventDispatcher.dispatch('toast', …)`
- Badge: corner overlay on cover (grid + list); spinner / check / empty ring; hide when no Calibre id
- On library mount (Bookshelf or page): once call `refreshIndexedIds(aiSettings.lightragBaseUrl)`

- [ ] **Step 1: Extend menu id type + getBookContextMenuItemIds**

```typescript
export type BookContextMenuItemId =
  | ... existing ...
  | 'indexLightRAG'
  | 'delete';
```

Insert before `'delete'`:

```typescript
if (isTauriAppPlatform() && parseCalibreBookId(book.filePath) != null) {
  ids.push('indexLightRAG');
}
```

Update `book-context-menu.test.ts` expectations: books **without** `filePath` Calibre id unchanged; with Calibre-style `filePath` include `indexLightRAG` before `delete`. Tests run in jsdom — `isTauriAppPlatform` may be false; gate the push on `parseCalibreBookId` only in the helper, and keep Tauri check in BookshelfItem when building the action, **or** pass `opts.lightRagIndex?: boolean` like `localSend`. Prefer opts flag:

```typescript
opts?: { localSend?: boolean; absOffline?: boolean; lightRagIndex?: boolean }

// in getBookContextMenuItemIds:
if (opts?.lightRagIndex && parseCalibreBookId(book.filePath) != null) {
  ids.push('indexLightRAG');
}
```

BookshelfItem passes `lightRagIndex: isTauriAppPlatform()`.

- [ ] **Step 2: Wire BookshelfItem menu action**

In `buildBookMenuItems`, add `indexLightRAG` entry that reads live AI settings and runs the job; toast errors.

- [ ] **Step 3: Cover badge on BookItem**

Subscribe to indexStatus store; compute `badgeState(parseCalibreBookId(book.filePath)!, …)`; render absolute-positioned icon bottom-end of cover (small, ~14px). Only when id non-null.

Use existing icon libs already imported in BookItem (`react-icons/md`): e.g. `MdOutlineCircle` / spinner class / `MdCheckCircle`.

- [ ] **Step 4: Run targeted tests**

```bash
cd apps/readest-app && pnpm exec vitest run \
  src/__tests__/app/library/book-context-menu.test.ts \
  src/__tests__/ai/calibrePath.test.ts \
  src/__tests__/ai/indexStatus.test.ts \
  src/__tests__/ai/indexJob.test.ts \
  src/__tests__/ai/shellScopes.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/readest-app/src/app/library/utils/libraryUtils.ts \
  apps/readest-app/src/app/library/components/BookshelfItem.tsx \
  apps/readest-app/src/app/library/components/BookItem.tsx \
  apps/readest-app/src/__tests__/app/library/book-context-menu.test.ts
git commit -m "feat(library): LightRAG index context menu and cover badge"
```

---

### Task 7: End-to-end manual verification

**Files:** none (checklist + optional note in `docs/superpowers/plans/2026-10-03-e2e-results.md`)

- [ ] **Step 1: Configure lib-rag**

Ensure `~/projects/lib-rag/config.yaml` has:

```yaml
paths:
  local_library: "/Users/danemacaulay/My Drive/Books/calibre"
```

- [ ] **Step 2: Run viz (for status badges)**

```bash
cd ~/projects/lib-rag && source .venv/bin/activate && calibre-rag viz --no-browser
```

- [ ] **Step 3: Build/run Readest**

```bash
cd apps/readest-app && pnpm tauri dev
# or release build if preferred
```

- [ ] **Step 4: Import one book in place** (if library empty)

Import Directory → Calibre path → **Read in place** ON → Flatten → EPUB → OK. Confirm `book.filePath` points into Calibre tree.

- [ ] **Step 5: Index from UI**

1. Settings → AI Assistant → set library path, calibredb, calibre-rag venv path  
2. Right-click book → **Add to LightRAG index**  
3. Badge shows spinner then check  
4. Confirm tag:  
   `/Applications/calibre.app/Contents/MacOS/calibredb --with-library="/Users/danemacaulay/My Drive/Books/calibre" show_metadata <id> | rg Tags`  
5. Confirm manifest: `calibre-rag status`  
6. Non-Calibre book (no `(id)` path) → no menu item / no badge  
7. Bad `calibreRagCmd` → toast, badge clears  

- [ ] **Step 6: Commit e2e notes if useful**

```bash
git add docs/superpowers/plans/2026-10-03-e2e-results.md
git commit -m "docs: record LightRAG library index E2E results"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Context menu Add / Re-index | 6 |
| Tag `rag-index` via local calibredb | 5 |
| `calibre-rag index --id` | 5 |
| Local library source of truth | 1 |
| Cover badge none/indexing/indexed | 2, 4, 6 |
| Indexing = in-flight only | 4, 5 |
| Indexed from `/api/books` | 4 |
| AI settings paths | 3 |
| Shell allowlist | 3 |
| Hide UI without Calibre id | 2, 6 |
| Errors → toast | 5, 6 |
| No bulk | (non-goal; no task) |
| Vitest helpers | 2, 3, 4, 5 |
| lib-rag local tests | 1 |
| Manual E2E | 7 |

## Self-review notes

- No TBD placeholders; absolute paths match this machine’s Calibre + lib-rag venv.
- `runCommand` currently hard-wires `resolveAgyShellScope` — Task 5 must pass allowlist **names** that match capabilities (`calibredb`, `calibre-rag`, `calibre-rag-venv`).
- Index timeout must be long (LightRAG extraction is slow).
- Menu visibility uses `opts.lightRagIndex` so Vitest need not mock Tauri.
