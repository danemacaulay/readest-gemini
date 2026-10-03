import { describe, expect, it } from 'vitest';
import { rebuildFollowUpQuestion } from '../../components/ask/AskPanel';

describe('rebuildFollowUpQuestion', () => {
  it('returns the follow-up alone when there are no prior turns', () => {
    expect(rebuildFollowUpQuestion([], 'Why?')).toBe('Why?');
  });

  it('rebuilds prior user/assistant turns into a one-shot prompt', () => {
    const rebuilt = rebuildFollowUpQuestion(
      [
        { id: '1', role: 'user', content: 'What is this?' },
        { id: '2', role: 'assistant', content: 'A river.' },
        { id: '3', role: 'error', content: 'ignored' },
      ],
      'Where?',
    );
    expect(rebuilt).toBe('User: What is this?\n\nAssistant: A river.\n\nUser follow-up: Where?');
  });
});
