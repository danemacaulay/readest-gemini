# Verification notes — Readest Ask + Antigravity + LightRAG

**Date:** 2026-10-03  
**Branch:** `feat/ask-antigravity-lightrag`  
**Scope:** Automated test gates + lib-rag HTTP smoke only — **not** full macOS in-app E2E (manual checklist pending; see below).

## Automated

| Suite | Command | Result |
|---|---|---|
| readest-app AI vitest | `pnpm exec dotenv -e .env -e .env.test.local -- vitest run src/__tests__/ai` | **74 passed** (13 files) |
| lib-rag retrieve pytest | `pytest tests/test_retrieve.py -v` | **3 passed** |

Note: bare `pnpm exec vitest run src/__tests__/ai` fails 2 suites (`providers`, `askPanelRebuild`) without dotenv env (supabase base64). Use the package `test` dotenv wrapper.

## Manual / environment

| Criterion | Result |
|---|---|
| Open EPUB → Ask → Antigravity answer | **Not run** (no interactive macOS app session in this verification) |
| Follow-up via `--conversation` | **Not run** |
| Ask with library → chips + grounded answer | **Not run** end-to-end in app |
| Quit/reopen → global search → jump | **Not run** |
| `agy` missing / lib-rag down → actionable errors | **Partial:** unit coverage in `askErrors.test.ts`; live UI not exercised |

### Environment notes

- **`agy`:** Not on default PATH (`which agy` → not found). Binary exists at `~/.local/bin/agy` and `--help` works. Settings leave shell scope as `agy`; `tauriRunCommand` prepends `~/.local/bin` (and brew paths) to PATH so Test agy / Ask can resolve user-local installs.
- **lib-rag:** Was down at start. Started with `make viz` (`127.0.0.1:8765`). `POST /api/retrieve` with `{"query":"power","mode":"hybrid"}` returned **HTTP 200** (~2+ min cold start while index loads). Server stopped after smoke.

## Remaining gaps

1. Full macOS manual checklist (success criteria 1–5) against a real EPUB and live `agy`.
2. Confirm settings/PATH discoverability for `agy` when not on PATH.
3. Confirm in-app error UX when lib-rag is stopped (unit-level mapping only so far).
