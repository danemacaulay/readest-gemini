'use client';

import React, { useEffect, useState } from 'react';
import Dialog from '@/components/Dialog';
import { useTranslation } from '@/hooks/useTranslation';
import type { AskMode } from '@/services/ai/ask/types';

export type AskComposerProps = {
  open: boolean;
  mode: AskMode;
  selectionText: string;
  bookTitle: string;
  onClose: () => void;
  onSubmit: (question: string) => void;
};

const AskComposer: React.FC<AskComposerProps> = ({
  open,
  mode,
  selectionText,
  bookTitle,
  onClose,
  onSubmit,
}) => {
  const _ = useTranslation();
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (open) setQuestion('');
  }, [open, mode, selectionText]);

  const title = mode === 'ask-with-library' ? _('Ask with library') : _('Ask');
  const preview =
    selectionText.length > 280 ? `${selectionText.slice(0, 280).trimEnd()}…` : selectionText;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <Dialog
      isOpen={open}
      title={title}
      onClose={onClose}
      boxClassName='sm:min-w-[28rem] sm:max-w-lg'
      aboveKeyboard
    >
      {open && (
        <form className='flex flex-col gap-3 p-4' onSubmit={handleSubmit}>
          <p className='text-xs text-base-content/60'>{bookTitle}</p>
          <blockquote className='border-base-content/20 max-h-28 overflow-y-auto border-l-2 pl-3 text-sm opacity-80'>
            {preview}
          </blockquote>
          <label className='flex flex-col gap-1'>
            <span className='text-sm font-medium'>{_('Your question')}</span>
            <textarea
              className='textarea textarea-bordered min-h-24 w-full text-base'
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={_('Ask about this passage…')}
              autoFocus
            />
          </label>
          <div className='flex justify-end gap-2'>
            <button type='button' className='btn btn-ghost btn-sm' onClick={onClose}>
              {_('Cancel')}
            </button>
            <button type='submit' className='btn btn-primary btn-sm' disabled={!question.trim()}>
              {_('Ask')}
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
};

export default AskComposer;
