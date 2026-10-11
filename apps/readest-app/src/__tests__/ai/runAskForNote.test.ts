import { describe, it, expect, vi } from 'vitest';
import { AskParseError } from '../../services/ai/ask/parseAskRegisters';
import { runAskForNote } from '../../services/ai/ask/runAskForNote';

const regs = [
  { kind: 'what' as const, text: 'A' },
  { kind: 'how' as const, text: 'B' },
  { kind: 'why' as const, text: 'C' },
  { kind: 'should' as const, text: 'D' },
];

describe('runAskForNote', () => {
  it('creates highlight, saves empty note with registers, toasts success', async () => {
    const ensureHighlight = vi.fn(() => ({ id: 'n1', note: '' }));
    const saveNote = vi.fn(async () => true);
    const toast = vi.fn();
    const runAsk = vi.fn(async () => ({ registers: regs, truncatedSelection: false }));

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
    expect(saveNote).toHaveBeenCalledWith('n1', '', { contribution: 'ai', askRegisters: regs });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' }));
  });

  it('preserves an existing human note and marks co-authored when Ask lands on it', async () => {
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
        runAsk: vi.fn(async () => ({ registers: regs, truncatedSelection: false })) as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => ({ id: 'n1', note: 'my prior thoughts' }),
        saveNote,
        toast,
        t: (k) => k,
      },
    );
    expect(ok).toBe(true);
    expect(saveNote).toHaveBeenCalledWith('n1', 'my prior thoughts', {
      contribution: 'co-authored',
      askRegisters: regs,
    });
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

  it('toasts AskParseError and skips save', async () => {
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
          throw new AskParseError('Ask returned an incomplete answer. Try again.');
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
      expect.objectContaining({
        type: 'error',
        message: 'Ask returned an incomplete answer. Try again.',
      }),
    );
  });

  it('returns false without toasting when saveNote returns false', async () => {
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
        runAsk: vi.fn(async () => ({ registers: regs, truncatedSelection: false })) as never,
        askDeps: { complete: vi.fn() as never, agyPath: 'agy' },
        ensureHighlight: () => ({ id: 'n1' }),
        saveNote,
        toast,
        t: (k) => k,
      },
    );
    expect(ok).toBe(false);
    expect(saveNote).toHaveBeenCalledWith('n1', '', { contribution: 'ai', askRegisters: regs });
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
