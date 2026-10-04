# Echoes Rich Multi-Call Retrieve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make lib-rag’s Echoes retrieve path run a multi-call LightRAG graph/vector strategy that returns a rich, Echoes-shaped payload, and feed as much of that (quotes included) into agy for a strong comparative synthesis.

**Architecture:** Keep `/api/retrieve` as the HTTP surface, add an Echoes profile that fans out several `aquery_data` calls in parallel (`naive`/`mix` for passages, `local` for ideas, `global`/`hybrid` for connections), merges/dedupes by `chunk_id` + book, and emits a typed payload (`books`, `passages`, `ideas`, `connections`, `synthesisContext`). Readest consumes that shape, stops truncating Echoes library context aggressively, and keeps synthesis as the primary UI with structured evidence underneath.

**Tech Stack:** lib-rag (`calibre_rag.retrieve`, FastAPI viz), LightRAG 1.5.x `aquery_data` + `QueryParam`, Readest TypeScript (`lightrag/client`, `echoes/*`, `promptBuilder`), vitest + pytest.

## Global Constraints

- No full re-index required; provenance already backfilled (`file_path=calibre:{id}`).
- Prefer `aquery_data` (structured), never scrape KG prompt fences.
- Synthesis quality > UI polish in this plan; Readest UI may stay mostly as-is except prompt/types wiring.
- Echoes synthesis prompt should prefer **richness over truncation** (dump quotes; raise/remove Echoes-specific char caps).
- Preserve backward-compatible fields (`sources`, `contextText`) as aliases while migrating clients.
- Keep `make viz` / `POST /api/retrieve` as the Readest base URL target (`http://127.0.0.1:8765`).

---

## File map

| File | Responsibility |
|------|----------------|
| `lib-rag/src/calibre_rag/retrieve.py` | Multi-call orchestration, merge/rank, Echoes payload builders |
| `lib-rag/src/calibre_rag/echoes_retrieve.py` *(new)* | Echoes-specific ranking/diversify helpers (keep `retrieve.py` thinner) |
| `lib-rag/src/calibre_rag/viz/server.py` | Accept `profile=echoes` (default for retrieve or explicit), pass selection/query |
| `lib-rag/tests/test_retrieve.py` | Unit tests for merge/rank + mocked multi-call |
| `lib-rag/tests/test_echoes_retrieve.py` *(new)* | Pure helpers: diversify, idea ranking, synthesisContext packing |
| `apps/readest-app/src/services/ai/lightrag/types.ts` | Typed Echoes retrieve result |
| `apps/readest-app/src/services/ai/lightrag/client.ts` | Parse rich payload; keep `sources`/`contextText` aliases |
| `apps/readest-app/src/services/echoes/types.ts` | Persist richer trail evidence (passages/ideas/books) |
| `apps/readest-app/src/services/echoes/promptBuilder.ts` | Build agy prompt from full synthesis pack (minimal truncation) |
| `apps/readest-app/src/services/echoes/runEchoes.ts` | Wire new client fields into prompt + store |
| `apps/readest-app/src/__tests__/echoes/*.ts` | Prompt + runEchoes tests for rich dump |

---

## Target API contract

`POST /api/retrieve` body:

```json
{
  "query": "user question or derived query",
  "selection": "optional seed passage",
  "mode": "hybrid",
  "profile": "echoes"
}
```

Response (Echoes profile):

```json
{
  "books": [
    {
      "bookId": 1646,
      "bookTitle": "Theaetetus",
      "referenceId": "1",
      "filePath": "calibre:1646",
      "passageCount": 2
    }
  ],
  "passages": [
    {
      "id": "s1",
      "bookId": 1646,
      "bookTitle": "Theaetetus",
      "referenceId": "1",
      "chunkId": "calibre:1646-chunk-010",
      "snippet": "…long quote…",
      "content": "…full retrieved chunk text…"
    }
  ],
  "ideas": [
    {
      "id": "i1",
      "name": "Assent",
      "type": "concept",
      "description": "…",
      "sourceIds": ["calibre:1870-chunk-001"],
      "bookIds": [1870]
    }
  ],
  "connections": [
    {
      "id": "c1",
      "from": "Plato",
      "to": "Judgement",
      "description": "…",
      "bookIds": [1646]
    }
  ],
  "synthesisContext": "…large curated pack: seed, books, full quotes, ideas, connections…",
  "sources": [ "/* alias of passages for old clients */" ],
  "contextText": "/* alias of synthesisContext */",
  "meta": {
    "profile": "echoes",
    "calls": [
      { "mode": "mix", "chunks": 12, "ms": 1200 },
      { "mode": "local", "entities": 40, "ms": 900 },
      { "mode": "global", "relations": 40, "ms": 900 }
    ],
    "caps": {
      "passages": 16,
      "ideas": 24,
      "connections": 40,
      "maxPassageChars": 8000
    }
  }
}
```

**Richness policy (explicit):**
- Passages keep **full chunk `content`** (not 400-char snips) for synthesis; UI may still line-clamp.
- `synthesisContext` includes full quotes, idea descriptions, and many connections — target **50–120KB** text when available, not 8KB.
- Cap only to protect pathological outliers (e.g. hard ceiling ~200KB for the pack).

---

### Task 1: Echoes merge/rank helpers (lib-rag, TDD)

**Files:**
- Create: `lib-rag/src/calibre_rag/echoes_retrieve.py`
- Create: `lib-rag/tests/test_echoes_retrieve.py`

**Interfaces:**
- Produces:
  - `diversify_passages(chunks, *, max_total, max_per_book) -> list`
  - `rank_ideas(entities, *, seed_terms, limit) -> list`
  - `rank_connections(relationships, *, idea_names, limit) -> list`
  - `build_books(passages, references, books_manifest) -> list`
  - `build_synthesis_context(*, seed, question, books, passages, ideas, connections) -> str`

- [ ] **Step 1: Write failing tests for diversify + idea ranking**

```python
def test_diversify_passages_caps_per_book():
    chunks = [
        {"chunk_id": "calibre:1-chunk-001", "content": "a" * 100, "file_path": "calibre:1"},
        {"chunk_id": "calibre:1-chunk-002", "content": "b" * 100, "file_path": "calibre:1"},
        {"chunk_id": "calibre:1-chunk-003", "content": "c" * 100, "file_path": "calibre:1"},
        {"chunk_id": "calibre:2-chunk-001", "content": "d" * 100, "file_path": "calibre:2"},
    ]
    out = diversify_passages(chunks, max_total=4, max_per_book=2)
    assert len(out) == 3
    assert sum(1 for c in out if "calibre:1" in c["chunk_id"]) == 2


def test_rank_ideas_prefers_seed_terms_and_concepts():
    entities = [
        {"entity_name": "Unrelated", "entity_type": "concept", "description": "zzz"},
        {"entity_name": "Assent", "entity_type": "concept", "description": "stoic assent"},
        {"entity_name": "Plato", "entity_type": "person", "description": "mentions assent"},
    ]
    out = rank_ideas(entities, seed_terms=["assent"], limit=2)
    assert out[0]["name"] == "Assent"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/danemacaulay/projects/lib-rag && .venv/bin/pytest tests/test_echoes_retrieve.py -v`  
Expected: FAIL (module missing)

- [ ] **Step 3: Implement helpers**

Notes:
- Derive `book_id` via existing `parse_calibre_book_id`.
- Seed terms = simple tokenize of `selection + query` (lowercase alnum tokens, len≥4).
- Idea score: seed overlap in name/description + type weight (`concept=3`, `person=2`, `school=2`, else 1).
- Connection score: both endpoints in selected idea set > one endpoint > neither; keep top N.
- Deduplicate chunks by `chunk_id`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_echoes_retrieve.py -v`  
Expected: PASS

- [ ] **Step 5: Commit (lib-rag)**

```bash
cd /Users/danemacaulay/projects/lib-rag
git add src/calibre_rag/echoes_retrieve.py tests/test_echoes_retrieve.py
git commit -m "$(cat <<'EOF'
feat(echoes): add merge/rank helpers for rich retrieve

EOF
)"
```

---

### Task 2: Multi-call orchestration in `retrieve_rag`

**Files:**
- Modify: `lib-rag/src/calibre_rag/retrieve.py`
- Modify: `lib-rag/tests/test_retrieve.py`
- Modify: `lib-rag/src/calibre_rag/viz/server.py` (pass `profile`)

**Interfaces:**
- Consumes: helpers from Task 1
- Produces: `retrieve_rag(cfg, question, mode, *, selection=None, profile="echoes"|"raw")`
- HTTP: `RetrieveBody.profile: Literal["echoes","raw"] = "echoes"`

**Multi-call plan (parallel `asyncio.gather`):**

| Call | Mode | Purpose |
|------|------|---------|
| A | `mix` | KG + vector passages (primary) |
| B | `naive` | Extra vector passages for quote diversity |
| C | `local` | Entity-heavy idea neighborhood |
| D | `global` | Relation-heavy thematic links |

Query strings:
- Base Q = `question` if present else first ~500 chars of `selection`
- For A/B: `Q` plus optional `\n\nPassage:\n{selection}` (existing behavior)
- For C: prefer compact seed keywords / selection headline
- For D: prefer question or theme phrase from selection

Merge:
1. Union chunks from A+B → diversify → passages (default caps: 16 total, 3/book)
2. Ideas from C (+ entities seen in A) → rank → 24
3. Connections from D (+ relations in A) filtered to idea endpoints → 40
4. Books from references ∪ passage bookIds
5. `synthesisContext` = rich pack with **full passage content**

Also return aliases:
- `sources` = passages (id/title/snippet/book*) for old Readest
- `contextText` = `synthesisContext`

- [ ] **Step 1: Write failing test that `retrieve_rag` awaits multiple `aquery_data` modes**

```python
def test_echoes_profile_fans_out_modes():
    # mock create_rag; aquery_data records modes; return minimal payloads
    ...
    out = asyncio.run(retrieve_rag(cfg, "assent", mode="hybrid", selection="…", profile="echoes"))
    assert set(modes_called) >= {"mix", "naive", "local", "global"}
    assert "passages" in out and "ideas" in out and "connections" in out and "books" in out
    assert out["contextText"] == out["synthesisContext"]
    assert len(out["synthesisContext"]) > 500  # richer than tiny stub
```

- [ ] **Step 2: Run test — expect FAIL**

- [ ] **Step 3: Implement orchestration + server body field**

```python
class RetrieveBody(BaseModel):
    query: str = Field(min_length=1)
    selection: str | None = None
    mode: str = "hybrid"  # retained for raw/compat; echoes profile uses fixed fan-out
    profile: Literal["echoes", "raw"] = "echoes"
```

`profile="raw"` keeps today’s single-call enrich path for debugging.

- [ ] **Step 4: Run `tests/test_retrieve.py` + `tests/test_echoes_retrieve.py` — PASS**

- [ ] **Step 5: Manual smoke**

```bash
# restart viz, then:
curl -s http://127.0.0.1:8765/api/retrieve -H 'content-type: application/json' \
  -d '{"query":"assent","selection":"circumstances have our assent","profile":"echoes"}' \
  | python -c "import sys,json;d=json.load(sys.stdin);print(len(d['passages']),len(d['ideas']),len(d['connections']),len(d['synthesisContext']))"
```

Expect: passages≥6, ideas≥5, connections≥5, synthesisContext ≫ 8k when index is warm.

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(echoes): multi-call LightRAG retrieve profile

EOF
)"
```

---

### Task 3: Readest client types + parse rich payload

**Files:**
- Modify: `apps/readest-app/src/services/ai/lightrag/types.ts`
- Modify: `apps/readest-app/src/services/ai/lightrag/client.ts`
- Modify: `apps/readest-app/src/__tests__/ai/lightragClient.test.ts`

**Interfaces:**
- Produces:

```ts
export type EchoesRetrieveResult = {
  books: EchoesBookRef[];
  passages: EchoesPassage[];
  ideas: EchoesIdea[];
  connections: EchoesConnection[];
  synthesisContext: string;
  // aliases
  sources: LightRAGSource[];
  contextText?: string;
};
```

- Client always sends `profile: 'echoes'`.
- Map `passages` → `sources` if server omits alias.

- [ ] **Step 1: Failing test — client parses books/passages/ideas/synthesisContext**

- [ ] **Step 2: Implement types + client mapping**

- [ ] **Step 3: `pnpm exec vitest run src/__tests__/ai/lightragClient.test.ts` — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(echoes): parse rich LightRAG retrieve payload

EOF
)"
```

---

### Task 4: Dump-rich synthesis into agy (Readest)

**Files:**
- Modify: `apps/readest-app/src/services/echoes/promptBuilder.ts`
- Modify: `apps/readest-app/src/services/echoes/runEchoes.ts`
- Modify: `apps/readest-app/src/services/echoes/types.ts` (store richer evidence on trail)
- Modify: `apps/readest-app/src/__tests__/echoes/promptBuilder.test.ts` (create if missing)
- Modify: `apps/readest-app/src/__tests__/echoes/runEchoes.test.ts`

**Policy:**
- Prefer `synthesisContext` as the main library block.
- Also list passages with **full `content`** (fallback snippet) and idea/connection sections.
- Echoes-specific limit: `ECHOES_LIBRARY_CHAR_LIMIT = 200_000` (soft). Only truncate above that with a clear marker.
- Do **not** reuse Ask’s `LIBRARY_CHAR_LIMIT = 8000` for Echoes.
- Consider bumping `completeWithAntigravity` timeout for Echoes to 10 minutes if needed (`timeoutMs`).

Prompt skeleton:

```
You are a careful comparative reading assistant...
Rules: use ONLY provided library pack; cite [s#] passage ids; ...

Seed...
Rich library pack:
{synthesisContext}

Passages (full quotes):
[s1] Book — ...
"""
full content
"""
...
```

- [ ] **Step 1: Failing tests — prompt includes long quotes and does not clamp at 8k**

- [ ] **Step 2: Implement promptBuilder + runEchoes wiring; persist `books`/`ideas`/`connections` on trail if cheap (JSON in echo store)**

Trail type extension (additive):

```ts
export type EchoTrail = {
  ...
  sources: EchoSource[]; // passages summary for UI/compat
  books?: EchoBook[];
  ideas?: EchoIdea[];
  connections?: EchoConnection[];
};
```

- [ ] **Step 3: Run echoes unit tests — PASS**

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(echoes): feed rich retrieve pack into agy synthesis

EOF
)"
```

---

### Task 5: Smoke + Readest rebuild

**Files:** none (ops)

- [ ] **Step 1: Ensure viz running with new code**

```bash
pkill -f 'calibre-rag viz' || true
# start detached viz on 8765
```

- [ ] **Step 2: Smoke multi-call retrieve latency + shape**

Record: wall time, passage/idea/connection counts, synthesisContext bytes, reference coverage.

- [ ] **Step 3: Manual Find Echoes in Readest after `pnpm install-macos`**

Check: synthesis cites real books; sources no longer KG fences; Open works when book in library.

- [ ] **Step 4: Note residual limits in PR/plan notes**

- Multi-call will be slower (often 1–3× single hybrid); acceptable for Echoes.
- Entity/relation `file_path` on graph objects may still be `unknown_source`; book ids come from chunk_id/source_id parsing.
- UI redesign (grouped books/ideas) is **follow-on**, not required to close this plan.

---

## Out of scope (follow-on)

- Full Echoes panel visual redesign (sketches A/B/C).
- Soft-import of Calibre books missing from Readest.
- Backfill of entity/relation `file_path` in graph/VDBs.
- LightRAG package bump 1.5.4 → 1.5.7 (optional hygiene).

---

## Success criteria

1. `profile=echoes` retrieve fans out ≥3 LightRAG modes and returns typed `books`/`passages`/`ideas`/`connections`.
2. `synthesisContext` routinely includes multiple full quotes and exceeds prior 8KB Ask cap.
3. Echoes agy prompt uses that pack; unit tests prove no 8KB clamp.
4. Manual Find Echoes produces a comparative synthesis that cites real library books from the pack.
