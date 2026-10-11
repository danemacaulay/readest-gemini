import type { AskRegister, AskRegisterKind } from '@/types/book';
import { ASK_REGISTER_KINDS } from '@/utils/askRegisters';

const PARSE_ERROR_MESSAGE = 'Ask returned an incomplete answer. Try again.';

export class AskParseError extends Error {
  constructor(message = PARSE_ERROR_MESSAGE) {
    super(message);
    this.name = 'AskParseError';
  }
}

const HEADING_RE = /^#{1,3}\s*(what|how|why|should)\b[\s:.\-–—]*$/i;
const FENCE_RE = /^```(?:\w+)?\s*$/;

export function parseAskRegisters(text: string): AskRegister[] {
  const byKind = new Map<AskRegisterKind, string[]>();
  let current: AskRegisterKind | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (FENCE_RE.test(line.trim())) continue;

    const heading = HEADING_RE.exec(line.trim());
    if (heading) {
      current = heading[1]!.toLowerCase() as AskRegisterKind;
      byKind.set(current, []);
      continue;
    }

    if (current) {
      byKind.get(current)!.push(rawLine);
    }
  }

  const registers = ASK_REGISTER_KINDS.map((kind) => {
    const lines = byKind.get(kind);
    if (!lines) throw new AskParseError();
    const body = lines.join('\n').trim();
    if (!body) throw new AskParseError();
    return { kind, text: body };
  });

  return registers;
}
