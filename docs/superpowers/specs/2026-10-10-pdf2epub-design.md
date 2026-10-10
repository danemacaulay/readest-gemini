# Design: pdf2epub (Marker → Pandoc CLI, Calibre plugin later)

**Date:** 2026-10-10  
**Status:** Approved for planning  
**Repo:** new standalone repository (not `reader`)  
**Phasing:** Phase 1 = CLI; Phase 2 = Calibre plugin wrapping the CLI

## Problem

Calibre’s built-in PDF→EPUB conversion is polished (title page, author metadata) but often mangles academic / multi-column layout. Marker (balanced) produces much better reflowable text, but shipping that path today is a manual multi-step glue job (Marker → Pandoc, plus missing Calibre-style polish).

## Goals

- One command converts any text-layer PDF to a reflowable EPUB
- Text quality from Marker **balanced** mode by default
- Calibre-like polish: generated **text title page**, **title** and **author** in EPUB metadata
- Auto metadata: PDF info dict + first-page heuristics; optional `--title` / `--author` overrides
- Standalone installable package: `pip install` pulls Marker; native tools remain external with install hints
- Architecture that lets a Calibre plugin call the same CLI later without reimplementing conversion

## Non-goals (Phase 1)

- Calibre plugin UI (Phase 2)
- First-page / rendered PDF cover image
- Scanned-PDF OCR tuning beyond Marker’s defaults
- Fixed-layout EPUB
- Bundling pandoc, llama.cpp binaries, or Marker model weights inside the wheel
- Homebrew formula / one-shot native installer (nice later; not Phase 1)
- GUI, watch folder, or cloud conversion

## Success criteria

- `pdf2epub path/to/paper.pdf` writes `path/to/paper.epub` with:
  - Readable reflow (Marker-quality for born-digital academic PDFs)
  - EPUB metadata title + author when discoverable
  - A generated text title page (title + author)
  - TOC from markdown headings
  - Embedded figures extracted by Marker when present
- `--title` / `--author` override auto detection
- `--fast` switches Marker to fast mode
- Clear error if `marker_single`, `pandoc`, or (for balanced) `llama-server` is missing
- Unit tests cover metadata resolution without running Marker

## Pipeline (Phase 1)

```
INPUT.pdf
  → dependency check (marker_single, pandoc, llama-server if balanced)
  → work dir (temp, or --keep beside PDF)
  → marker_single --mode balanced|fast --output_format markdown
  → resolve metadata (CLI flags > PDF info > markdown heuristics > filename)
  → pandoc markdown → EPUB
       (TOC, resource-path for images, title page, title/author metadata)
  → write OUTPUT.epub (default: beside PDF)
```

No Calibre dependency in Phase 1. Pandoc supplies title page + metadata polish.

## Metadata resolution

Priority order:

1. `--title` / `--author` if provided
2. PDF document info dictionary (`/Title`, `/Author`) when non-empty / non-garbage
3. First-page heuristics on Marker markdown:
   - First H1 → title (strip emphasis markers)
   - Following short line that looks like authors (names, commas, “and”, affiliation cues) → author
4. Fallback: title = input filename stem; author omitted

Always emit a text title page when converting. If author is unknown, title page shows title only.

## CLI surface

```
pdf2epub INPUT.pdf [--out PATH] [--title T] [--author A] [--fast] [--keep]
```

| Flag | Behavior |
|------|----------|
| `--out` | Output EPUB path (default: `<input_stem>.epub` next to PDF) |
| `--title` | Override title |
| `--author` | Override author |
| `--fast` | Marker `--mode fast` instead of `balanced` |
| `--keep` | Keep intermediate markdown/images next to the PDF (or under a sibling dir) |

Exit non-zero on conversion failure; print actionable stderr for missing deps.

## Repo shape

New standalone repo, e.g. `pdf2epub`:

```
pdf2epub/
  README.md                 # deps: marker-pdf, pandoc, llama.cpp (balanced)
  pyproject.toml            # console_scripts: pdf2epub
  src/pdf2epub/
    __init__.py
    cli.py                  # argparse/typer entry
    convert.py              # orchestration
    metadata.py             # PDF info + markdown heuristics
    deps.py                 # binary discovery / version checks
  calibre_plugin/           # Phase 2 stub or deferred until Phase 2
  tests/
    test_metadata.py
    test_cli_args.py
```

## Packaging & external dependencies

**Phase 1 packaging model (chosen): Python extras + bootstrap hints**

| Layer | How it ships | Notes |
|-------|----------------|-------|
| `pdf2epub` CLI | `pip install pdf2epub` (or `pip install .`) | Our package |
| `marker-pdf` | Declared dependency in `pyproject.toml` | Pulled by pip; provides `marker_single` |
| `pandoc` | System / Homebrew / OS package | Not bundled; `deps.py` detects and prints install hint |
| `llama-server` (llama.cpp) | System / Homebrew | Required for default balanced mode; hint if missing; `--fast` skips |
| Marker model weights | Downloaded by Marker on first balanced run | Not vendored; document disk/time expectation in README |
| Calibre | System app | Phase 2 only |

On missing native deps, exit non-zero with a short, copy-pasteable install hint (e.g. `brew install pandoc`, `brew install llama.cpp`). Do not auto-install system packages.

README documents: `pip install pdf2epub` then ensure `pandoc` (+ `llama.cpp` for balanced) are on `PATH`.

## Phase 2 — Calibre plugin (deferred)

- Thin wrapper only: discover `pdf2epub` on `PATH` (or configured path), run as a job, import resulting EPUB into the Calibre library
- No conversion / metadata logic inside the plugin
- Same repo, separate install path (Calibre plugin zip)
- Out of scope until Phase 1 CLI is usable end-to-end

## Testing strategy

- Unit: metadata priority, heuristic parsing fixtures (sample markdown heads), CLI flag parsing
- Manual / smoke: one known academic PDF (e.g. Cognification paper) → open EPUB in Apple Books / Calibre viewer
- Do not run full Marker balanced in CI by default (model download + GPU/CPU cost); optional marked integration test later

## Open questions (resolved)

| Question | Decision |
|----------|----------|
| Where does it live? | Standalone repo |
| Metadata default | Auto (PDF + heuristics) + overrides |
| Title page | Generated text only (no PDF cover) |
| Default Marker mode | `balanced` (`--fast` opt-in) |
| Implementation style | Thin Python CLI |
| Calibre plugin | After CLI (wrapper on top of CLI) |
| Packaging | pip pulls `marker-pdf`; pandoc + llama.cpp stay external with install hints |
