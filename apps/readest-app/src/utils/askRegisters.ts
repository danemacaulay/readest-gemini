import type { AskRegister, AskRegisterKind } from '@/types/book';

export const ASK_REGISTER_KINDS = [
  'what',
  'how',
  'why',
  'should',
] as const satisfies readonly AskRegisterKind[];

export const ASK_REGISTER_LABELS: Record<AskRegisterKind, string> = {
  what: 'What',
  how: 'How',
  why: 'Why',
  should: 'Should',
};

/** Format registers as markdown for copy/export only — never written into `note`. */
export function renderAskRegistersMarkdown(registers: readonly AskRegister[]): string {
  return registers
    .map((register) => `**${ASK_REGISTER_LABELS[register.kind]}**\n\n${register.text}`)
    .join('\n\n');
}
