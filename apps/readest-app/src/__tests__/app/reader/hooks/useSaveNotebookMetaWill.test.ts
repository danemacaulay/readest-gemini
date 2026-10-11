import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookNote } from '@/types/book';
import { createEmptyMetaWill } from '@/utils/metaWill';

const h = vi.hoisted(() => ({
  booknotes: [] as BookNote[],
  saveConfig: vi.fn(),
  updateBooknotes: vi.fn(),
  hydrate: vi.fn(),
  markSaved: vi.fn(),
  markSaveFailed: vi.fn(),
}));

vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ settings: {} }) }));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: () => ({ booknotes: h.booknotes, location: 'epubcfi(/6/2)' }),
    saveConfig: h.saveConfig,
    updateBooknotes: h.updateBooknotes,
  }),
}));
vi.mock('@/store/notebookDocumentStore', () => ({
  useNotebookDocumentStore: {
    getState: () => ({
      sessions: {
        book: { revision: 0 },
      },
      hydrate: h.hydrate,
      markSaved: h.markSaved,
      markSaveFailed: h.markSaveFailed,
    }),
  },
}));

import { useSaveNotebookMetaWill } from '@/app/reader/hooks/useSaveNotebookMetaWill';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.booknotes = [];
  h.updateBooknotes.mockImplementation((_key: string, booknotes: BookNote[]) => {
    h.booknotes = booknotes;
    return { booknotes, location: 'epubcfi(/6/2)' };
  });
  h.saveConfig.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('useSaveNotebookMetaWill', () => {
  it('serializes saves so a newer snapshot cannot finish before an older one', async () => {
    const firstSave = deferred();
    h.saveConfig.mockReturnValueOnce(firstSave.promise).mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useSaveNotebookMetaWill('book-view'));
    const first = createEmptyMetaWill();
    first.sections[0]!.text = 'first';
    const second = createEmptyMetaWill();
    second.sections[0]!.text = 'second';

    const firstResult = result.current(first);
    await waitFor(() => expect(h.saveConfig).toHaveBeenCalledTimes(1));
    const secondResult = result.current(second);
    expect(h.saveConfig).toHaveBeenCalledTimes(1);

    firstSave.resolve();
    await expect(firstResult).resolves.toBe(true);
    await expect(secondResult).resolves.toBe(true);
    expect(h.saveConfig).toHaveBeenCalledTimes(2);
    expect(h.saveConfig.mock.calls[1]?.[2].booknotes[0].note).toContain('second');
  });

  it('rolls back the optimistic update and marks the document failed on rejection', async () => {
    const existing: BookNote = {
      id: 'notebook',
      type: 'notebook',
      cfi: 'epubcfi(/6/2)',
      note: 'before',
      createdAt: 1,
      updatedAt: 1,
    };
    h.booknotes = [existing];
    h.saveConfig.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useSaveNotebookMetaWill('book-view'));
    const metaWill = createEmptyMetaWill();
    metaWill.sections[0]!.text = 'after';

    await expect(result.current(metaWill)).resolves.toBe(false);

    expect(h.booknotes).toEqual([existing]);
    expect(h.updateBooknotes).toHaveBeenCalledTimes(2);
    expect(h.markSaveFailed).toHaveBeenCalledWith('book');
    expect(h.markSaved).not.toHaveBeenCalled();
  });
});
