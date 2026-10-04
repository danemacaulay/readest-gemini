import { describe, it, expect, vi } from 'vitest';
import { runAskForNote } from '../../services/ai/ask/runAskForNote';

describe('runAskForNote', () => {
  it('creates highlight, saves trimmed answer, toasts success', async () => {
    const ensureHighlight = vi.fn(() => ({ id: 'n1' }));
    const saveNote = vi.fn(async () => true);
    const toast = vi.fn();
    const runAsk = vi.fn(async () => ({ answer: 'Hello', truncatedSelection: false }));

    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        selectionCfi: 'epubcfi(/1)',
        bookAuthor: 'Author',
      },
      {
        runAsk: runAsk as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight,
        saveNote,
        toast,
        t: (k) => k,
      },
    );

    expect(ok).toBe(true);
    expect(ensureHighlight).toHaveBeenCalledBefore(runAsk as never);
    expect(saveNote).toHaveBeenCalledWith('n1', 'Hello');
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  it('toasts error and skips save when ask fails', async () => {
    const saveNote = vi.fn(async () => true);
    const toast = vi.fn();
    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        bookAuthor: 'Author',
      },
      {
        runAsk: vi.fn(async () => {
          throw new Error('agy blew up');
        }) as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => ({ id: 'n1' }),
        saveNote,
        toast,
        t: (k) => k,
      },
    );
    expect(ok).toBe(false);
    expect(saveNote).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'agy blew up' }),
    );
  });

  it('returns false without toasting when saveNote returns false', async () => {
    // Caller (useSaveBooknoteNoteText) already toasts on save failure.
    const saveNote = vi.fn(async () => false);
    const toast = vi.fn();
    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        bookAuthor: 'Author',
      },
      {
        runAsk: vi.fn(async () => ({ answer: 'Hello', truncatedSelection: false })) as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => ({ id: 'n1' }),
        saveNote,
        toast,
        t: (k) => k,
      },
    );
    expect(ok).toBe(false);
    expect(saveNote).toHaveBeenCalledWith('n1', 'Hello');
    expect(toast).not.toHaveBeenCalled();
  });

  it('aborts when highlight cannot be created', async () => {
    const runAsk = vi.fn();
    const saveNote = vi.fn(async () => true);
    const toast = vi.fn();
    const ok = await runAskForNote(
      {
        bookHash: 'h',
        bookTitle: 'Book',
        selectionText: 'sel',
        bookAuthor: 'Author',
      },
      {
        runAsk: runAsk as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => null,
        saveNote,
        toast,
        t: (k) => k,
      },
    );
    expect(ok).toBe(false);
    expect(runAsk).not.toHaveBeenCalled();
    expect(saveNote).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith({
      type: 'error',
      message: 'Could not create note anchor.',
    });
  });
});
