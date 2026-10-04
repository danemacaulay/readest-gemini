/**
 * Cross-webview map of open books → Tauri window labels.
 *
 * Each reader window has its own Zustand store, so the library window cannot
 * see `bookKeys` from an already-open reader. localStorage is shared across
 * webviews in the same Tauri app origin, so we publish open books here and
 * focus the owning window instead of spawning a duplicate.
 */

const STORAGE_KEY = 'readest:reader-window-books';

type Registry = Record<string, string>; // bookHash → windowLabel

function readRegistry(): Registry {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Registry;
  } catch {
    return {};
  }
}

function writeRegistry(reg: Registry): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reg));
  } catch {
    // Quota / private mode — open-in-place degrades to new window.
  }
}

/** Publish the books currently open in this reader window. */
export function publishReaderWindowBooks(windowLabel: string, bookHashes: string[]): void {
  const reg = readRegistry();
  for (const [hash, label] of Object.entries(reg)) {
    if (label === windowLabel) delete reg[hash];
  }
  for (const hash of bookHashes) {
    if (hash) reg[hash] = windowLabel;
  }
  writeRegistry(reg);
}

/** Drop all entries for a closed/destroyed reader window. */
export function clearReaderWindowBooks(windowLabel: string): void {
  const reg = readRegistry();
  let changed = false;
  for (const [hash, label] of Object.entries(reg)) {
    if (label === windowLabel) {
      delete reg[hash];
      changed = true;
    }
  }
  if (changed) writeRegistry(reg);
}

export function getReaderWindowLabelForBook(bookHash: string): string | undefined {
  const label = readRegistry()[bookHash];
  return label || undefined;
}
