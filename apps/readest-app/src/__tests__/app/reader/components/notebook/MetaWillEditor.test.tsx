import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MetaWillEditor from '@/app/reader/components/notebook/MetaWillEditor';
import { createEmptyMetaWill } from '@/utils/metaWill';

const saveMetaWill = vi.fn();

vi.mock('@/app/reader/hooks/useSaveNotebookMetaWill', () => ({
  useSaveNotebookMetaWill: () => saveMetaWill,
}));

describe('MetaWillEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    saveMetaWill.mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the five labelled text sections', () => {
    render(<MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />);

    expect(screen.getByRole('textbox', { name: 'Why I read it' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'What shifted' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'What I take' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'What I refuse' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Still open' })).toBeTruthy();
  });

  it('debounces saving updated section text', () => {
    render(<MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Why I read it' }), {
      target: { value: 'To understand leadership' },
    });
    expect(saveMetaWill).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));

    expect(saveMetaWill).toHaveBeenCalledTimes(1);
    expect(saveMetaWill.mock.calls[0]?.[0].sections[0]).toEqual({
      id: 'why',
      text: 'To understand leadership',
      links: [],
    });
  });

  it('flushes a pending edit when unmounted before the debounce', () => {
    const { unmount } = render(
      <MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Why I read it' }), {
      target: { value: 'Do not lose this draft' },
    });
    unmount();

    expect(saveMetaWill).toHaveBeenCalledTimes(1);
    expect(saveMetaWill.mock.calls[0]?.[0].sections[0].text).toBe('Do not lose this draft');
  });
});
