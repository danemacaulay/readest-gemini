import { describe, expect, it } from 'vitest';
import { AskParseError, parseAskRegisters } from '@/services/ai/ask/parseAskRegisters';

const full = `## What\nSays X.\n\n## How\nBy Y.\n\n## Why\nBecause Z.\n\n## Should\nMostly right.\n\n## Argue\nSteelman, then tension.`;

describe('parseAskRegisters', () => {
  it('parses five sections in canonical order', () => {
    expect(parseAskRegisters(full)).toEqual([
      { kind: 'what', text: 'Says X.' },
      { kind: 'how', text: 'By Y.' },
      { kind: 'why', text: 'Because Z.' },
      { kind: 'should', text: 'Mostly right.' },
      { kind: 'argue', text: 'Steelman, then tension.' },
    ]);
  });

  it('accepts other heading levels, trailing colons, shuffled order, and code fences', () => {
    const messy =
      '```markdown\n### Argue:\nPush back.\n### Should:\nNo.\n# WHY\nCtx.\n## How\nStruct.\n## What\nClaim.\n```';
    expect(parseAskRegisters(messy).map((r) => `${r.kind}=${r.text}`)).toEqual([
      'what=Claim.',
      'how=Struct.',
      'why=Ctx.',
      'should=No.',
      'argue=Push back.',
    ]);
  });

  it('ignores text before the first heading', () => {
    expect(parseAskRegisters(`Sure, here you go:\n\n${full}`)[0]!.text).toBe('Says X.');
  });

  it('throws AskParseError when a register is missing or empty', () => {
    expect(() => parseAskRegisters('## What\nX.\n## How\nY.\n## Why\nZ.\n## Should\nS.')).toThrow(
      AskParseError,
    );
    expect(() => parseAskRegisters(`${full}`.replace('Steelman, then tension.', ''))).toThrow(
      'Ask returned an incomplete answer. Try again.',
    );
  });
});
