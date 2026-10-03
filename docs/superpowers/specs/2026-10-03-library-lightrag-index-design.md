# Design: Library → LightRAG Index (local Calibre)

**Date:** 2026-10-03  
**Status:** Approved (awaiting implementation plan)  
**Repos:** `reader` (Readest soft-fork) + sibling `~/projects/lib-rag`

## Goal

From the Readest library, a user can right-click a Calibre-backed book and **Add to LightRAG index**. The app tags that book `rag-index` in the **local** Calibre library, runs `calibre-rag index --id <id>`, and shows a small cover badge for **not indexed / indexing / indexed**. Indexing does not require restarting Readest. The Raspberry Pi is no longer the source of truth for this path.

## Non-goals (v1)

- Bulk / select-mode indexing
- Removing Pi sync code from lib-rag entirely (unused fallback OK)
- Progress percentage UI or streaming index logs in the shelf
- Embedding a Python/LightRAG runtime inside Tauri
- HTTP `POST /api/index` (deferred; CLI is the v1 transport)
- Auto-index on import

## Constraints and decisions

| Decision | Choice |
|---|---|
| Trigger | Book context menu only (no bulk) |
| Tag policy | Always ensure Calibre tag `rag-index` before index (option B) |
| Calibre source of truth | Local library (Google Drive path), not Pi |
| Invocation | Shell out: `calibredb` then `calibre-rag index --id` (Approach 1) |
| Visual | Cover corner badge: none / spinner / check |
| “Indexing” state | Only jobs started by this app (in-memory); no continuous LightRAG polling |
| “Indexed” state | One-shot load from lib-rag manifest or `GET /api/books`, then cache |
| Platform | macOS desktop (existing soft-fork scope) |

## Architecture

```
Readest library (BookItem / BookshelfItem)
        │ context menu: Add to LightRAG index
        ▼
  resolve Calibre book_id from filePath  (…/Title (123)/file.epub)
        │
        ├─► calibredb --with-library=<calibreLibraryPath>
        │     set_metadata <id> --field tags:…,rag-index
        │
        └─► calibre-rag index --id <id>
              (lib-rag local_library mode: no Pi scp)
        │
        ▼
  badge: indexing → indexed (refresh status cache on success)
```

**Boundaries**

- **Readest** owns UI, path→id parsing, shell orchestration, badge state.
- **lib-rag** owns tagging policy consumption (`include_tags: [rag-index]`), extraction, LightRAG insert, manifest.
- **Calibre** remains the tag store via `calibredb` against the local library path.

## Components

| Unit | Responsibility | Depends on |
|---|---|---|
| `parseCalibreBookId(filePath)` | Extract numeric id from Calibre folder segment `Title (N)` | Book.`filePath` |
| `indexJob.ts` | Merge tags → `calibredb`; spawn `calibre-rag index --id`; track in-flight ids | Tauri shell `runCommand`, AI settings |
| `indexStatus.ts` | Load indexed book ids once; merge with in-flight → `none \| indexing \| indexed` | lib-rag HTTP or manifest path |
| Context menu item | Show when id resolvable; disable while in-flight; allow re-index when indexed | BookshelfItem |
| Cover badge | Corner indicator on BookItem when id known | indexStatus |
| AI settings | `calibreLibraryPath`, `calibreRagCmd`, `calibredbPath` | SettingsDialog AI tab |
| lib-rag `paths.local_library` | When set: catalog = `{local}/metadata.db`, files from that tree; skip Pi sync | config.yaml / Config |

### Settings defaults

| Key | Default |
|---|---|
| `calibreLibraryPath` | User’s local Calibre root (e.g. `…/My Drive/Books/calibre`) |
| `calibreRagCmd` | Absolute path preferred: `~/projects/lib-rag/.venv/bin/calibre-rag` (falls back to allowlisted name `calibre-rag`) |
| `calibredbPath` | `/Applications/calibre.app/Contents/MacOS/calibredb` |
| `lightragBaseUrl` | Existing `http://127.0.0.1:8765` (status refresh when viz is up) |

### Shell allowlist

Extend Tauri shell capabilities the same way as `agy`, so GUI PATH and allowlisted command names can run `calibredb` and `calibre-rag` (or configured command names).

## Data flow

1. User opens context menu on a library book with absolute Calibre `filePath`.
2. If `parseCalibreBookId` fails → no menu item / no badge.
3. On **Add to LightRAG index** (or **Re-index**):
   - Mark id in-flight → badge spinner.
   - `calibredb show_metadata` → merge `rag-index` into tags → `set_metadata`.
   - On tag failure → toast, clear in-flight, stop.
   - `calibre-rag index --id <id>` with cwd/env pointing at lib-rag (or absolute cmd).
   - On exit 0 → remove in-flight, refresh indexed set, badge check.
   - On non-zero → toast + brief stderr, restore prior badge.
4. Concurrent click on same id while in-flight → no-op.

### lib-rag local mode

When `paths.local_library` is set:

- `sync_catalog` copies `{local_library}/metadata.db` → `catalog_cache` (no SSH; copy avoids locking the live Calibre DB).
- Book file resolution reads `{local_library}/{book.path}/…` directly (no mirror `scp` from Pi).
- `index --id` still filters by `rag-index` after tagging (unchanged policy).

Pi SSH remains available when `local_library` is unset (legacy).

## Error handling

| Case | Behavior |
|---|---|
| No Calibre id in path | Hide badge + menu item |
| Missing `calibredb` / `calibre-rag` | Toast with path hint; clear indexing |
| Tag fails | Toast; do not start index |
| Index non-zero | Toast + stderr snippet; badge → previous |
| Already indexed | Menu offers **Re-index** (CLI hash-skip if unchanged) |
| Status fetch fails | Show only in-flight; others appear as none (no toast spam) |
| Same book already indexing | Ignore second click |

## Testing

**Vitest (Readest)**

- Path → book_id parsing (happy path, missing, nested)
- Tag merge / dedupe for `rag-index`
- Status reducer: indexed ∩ in-flight → badge enum

**lib-rag**

- Local library mode uses local `metadata.db` and skips SSH
- After tag, `index --id` selects that book from local catalog

**Manual**

- Context menu on Drive Calibre book → spinner → check
- Bad `calibreRagCmd` → toast
- Non-Calibre book → no badge/menu

## Open follow-ups (not v1)

- `POST /api/index` for progress streaming
- Delete / unindex from context menu (`calibre-rag unindex --id`)
- Drop Pi sync codepaths entirely once local mode is proven
- Auto-index hooks after folder import
