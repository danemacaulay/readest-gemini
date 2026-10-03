import type { RunCommand } from '../ask/antigravityClient';
import { mergeRagIndexTags, parseCalibreBookId } from './calibrePath';
import { getInFlightIds, markIndexed, refreshIndexedIds, setInFlight } from './indexStatus';
import { resolveCalibreShellScope } from './shellScopes';

export const LIGHT_RAG_INDEX_TIMEOUT_MS = 1_800_000;
const TAG_TIMEOUT_MS = 60_000;

export class CalibreTagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalibreTagError';
  }
}

export class LightRAGIndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LightRAGIndexError';
  }
}

export function parseCalibreTagsFromMetadata(stdout: string): string[] {
  for (const line of stdout.split(/\r?\n/)) {
    if (/^Tags\s*:/i.test(line)) {
      const rest = line.split(':').slice(1).join(':');
      return rest
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    }
  }
  return [];
}

export type EnsureRagIndexTagOpts = {
  bookId: number;
  calibreLibraryPath: string;
  calibredbPath: string;
  runCommand: RunCommand;
  timeoutMs?: number;
};

export type RunLightRAGIndexJobOpts = {
  filePath: string;
  calibreLibraryPath: string;
  calibredbPath: string;
  calibreRagCmd: string;
  lightragBaseUrl?: string;
  runCommand: RunCommand;
  timeoutMs?: number;
};

function libraryFlag(calibreLibraryPath: string): string {
  return `--with-library=${calibreLibraryPath}`;
}

export async function ensureRagIndexTag(opts: EnsureRagIndexTagOpts): Promise<void> {
  const { bookId, calibreLibraryPath, calibredbPath, runCommand } = opts;
  const timeoutMs = opts.timeoutMs ?? TAG_TIMEOUT_MS;
  const cmd = resolveCalibreShellScope('calibredb', calibredbPath);
  const id = String(bookId);

  const show = await runCommand(cmd, [libraryFlag(calibreLibraryPath), 'show_metadata', id], {
    timeoutMs,
  });
  if (show.code !== 0) {
    throw new CalibreTagError(
      `Failed to read Calibre tags for book ${id}: ${show.stderr.trim() || `exit ${show.code}`}`,
    );
  }

  const merged = mergeRagIndexTags(parseCalibreTagsFromMetadata(show.stdout));
  const set = await runCommand(
    cmd,
    [libraryFlag(calibreLibraryPath), 'set_metadata', id, '--field', `tags:${merged}`],
    { timeoutMs },
  );
  if (set.code !== 0) {
    throw new CalibreTagError(
      `Failed to set Calibre tags for book ${id}: ${set.stderr.trim() || `exit ${set.code}`}`,
    );
  }
}

export async function runLightRAGIndexJob(opts: RunLightRAGIndexJobOpts): Promise<void> {
  const bookId = parseCalibreBookId(opts.filePath);
  if (bookId == null) {
    throw new LightRAGIndexError('Could not resolve Calibre book id from file path');
  }

  if (getInFlightIds().has(bookId)) {
    return;
  }

  setInFlight(bookId, true);
  try {
    await ensureRagIndexTag({
      bookId,
      calibreLibraryPath: opts.calibreLibraryPath,
      calibredbPath: opts.calibredbPath,
      runCommand: opts.runCommand,
    });

    const ragCmd = resolveCalibreShellScope('calibre-rag', opts.calibreRagCmd);
    const timeoutMs = opts.timeoutMs ?? LIGHT_RAG_INDEX_TIMEOUT_MS;
    const index = await opts.runCommand(ragCmd, ['index', '--id', String(bookId)], {
      timeoutMs,
    });
    if (index.code !== 0) {
      throw new LightRAGIndexError(
        `LightRAG index failed for book ${bookId}: ${index.stderr.trim() || `exit ${index.code}`}`,
      );
    }

    setInFlight(bookId, false);
    markIndexed(bookId);
    if (opts.lightragBaseUrl) {
      await refreshIndexedIds(opts.lightragBaseUrl);
    }
  } catch (err) {
    setInFlight(bookId, false);
    throw err;
  }
}
