import clsx from 'clsx';
import React, { useState } from 'react';

import type { AskRegister, AskRegisterKind } from '@/types/book';
import type { AskReaction } from '@/utils/askRegisterFeedback';
import { ASK_REGISTER_LABELS } from '@/utils/askRegisters';
import { useTranslation } from '@/hooks/useTranslation';
import TextButton from '@/components/TextButton';
import TextEditor from '@/components/TextEditor';

export type AskRegistersProps = {
  registers: readonly AskRegister[];
  onReact: (kind: AskRegisterKind, reaction: AskReaction) => void;
  onProposal: (kind: AskRegisterKind, text: string) => void;
};

const REACTIONS: { reaction: AskReaction | 'propose'; emoji: string; label: string }[] = [
  { reaction: 'like', emoji: '👍', label: 'Like' },
  { reaction: 'dislike', emoji: '👎', label: 'Dislike' },
  { reaction: 'correct', emoji: '✅', label: 'Correct' },
  { reaction: 'incorrect', emoji: '❌', label: 'Incorrect' },
  { reaction: 'propose', emoji: '💬', label: 'Propose' },
];

const AskRegisters: React.FC<AskRegistersProps> = ({ registers, onReact, onProposal }) => {
  const _ = useTranslation();
  const [editingKind, setEditingKind] = useState<AskRegisterKind | null>(null);
  const [draft, setDraft] = useState('');

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <ul className='flex flex-col gap-3' onClick={stop}>
      {registers.map((register) => {
        const feedback = register.feedback;
        const isEditing = editingKind === register.kind;
        return (
          <li key={register.kind} className='flex flex-col gap-1'>
            <div className='content font-size-xs font-medium tracking-wide uppercase opacity-70'>
              {_(ASK_REGISTER_LABELS[register.kind])}
            </div>
            <p className='content font-size-sm whitespace-pre-wrap' dir='auto'>
              {register.text}
            </p>
            {feedback?.proposal ? (
              <p className='content font-size-xs opacity-80' data-testid='ask-proposal' dir='auto'>
                <span className='opacity-70'>{_('Proposal')}</span> · {feedback.proposal}
              </p>
            ) : null}
            <div className='flex items-center gap-1' dir='ltr'>
              {REACTIONS.map(({ reaction, emoji, label }) => {
                const pressed =
                  reaction === 'propose'
                    ? !!feedback?.proposal || isEditing
                    : reaction === 'like' || reaction === 'dislike'
                      ? feedback?.rating === reaction
                      : feedback?.verdict === reaction;
                return (
                  <button
                    key={reaction}
                    type='button'
                    className={clsx(
                      'btn btn-ghost btn-xs p-0 transition duration-300 ease-in-out hover:border-transparent hover:bg-transparent',
                      pressed ? 'eink-bordered opacity-100' : 'opacity-40',
                    )}
                    aria-label={_(label)}
                    aria-pressed={pressed}
                    onClick={(e) => {
                      stop(e);
                      if (reaction === 'propose') {
                        setEditingKind(isEditing ? null : register.kind);
                        setDraft(feedback?.proposal ?? '');
                        return;
                      }
                      onReact(register.kind, reaction);
                    }}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
            {isEditing ? (
              <div className='flex flex-col gap-2 pt-1' onClick={stop}>
                <TextEditor
                  value={draft}
                  onChange={setDraft}
                  onSave={() => {
                    onProposal(register.kind, draft);
                    setEditingKind(null);
                  }}
                  onEscape={() => setEditingKind(null)}
                  spellCheck={false}
                  autoFocus
                />
                <div className='flex shrink-0 justify-end gap-3' dir='ltr'>
                  <TextButton onClick={() => setEditingKind(null)}>{_('Cancel')}</TextButton>
                  <TextButton
                    onClick={() => {
                      onProposal(register.kind, draft);
                      setEditingKind(null);
                    }}
                  >
                    {_('Save')}
                  </TextButton>
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

export default AskRegisters;
