'use client';

import clsx from 'clsx';
import { useCallback, useRef, useState } from 'react';
import { IoArrowBack } from 'react-icons/io5';

import HistoryList from '@/components/ask/HistoryList';
import WindowButtons from '@/components/WindowButtons';
import { useEnv } from '@/context/EnvContext';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useLibrary } from '@/hooks/useLibrary';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { useTranslation } from '@/hooks/useTranslation';
import type { QAThread } from '@/services/ai/history/types';
import { navigateToLibrary } from '@/utils/nav';
import { useBookTransferActions } from '../hooks/useBookTransferActions';
import { useOpenBook } from '../hooks/useOpenBook';

/**
 * Global Ask / Ask-with-library history. Searchable across books; opening a
 * thread jumps to the book (and CFI when available) and restores the panel.
 * Opens go through {@link useOpenBook} so cloud-only books download first.
 */
export default function QuestionsPage() {
  const _ = useTranslation();
  const router = useAppRouter();
  const { envConfig, appService } = useEnv();
  const { libraryLoaded } = useLibrary();
  const { getBookByHash, updateBook } = useLibraryStore();
  const { safeAreaInsets: insets, isRoundedWindow } = useThemeStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);
  const [, setLoading] = useState(false);
  // Progress overlays live on the shelf; Questions only needs download success.
  const { handleBookDownload } = useBookTransferActions(
    envConfig,
    appService,
    updateBook,
    () => {},
  );
  const { openBook } = useOpenBook({ setLoading, handleBookDownload });

  useTheme({ systemUIVisible: true, appThemeColor: 'base-200' });

  const goBack = () => {
    document.documentElement.setAttribute('data-nav-direction', 'back');
    navigateToLibrary(router);
  };

  const resolveBookPresent = useCallback(
    (bookHash: string) => {
      const book = getBookByHash(bookHash);
      return !!book && !book.deletedAt;
    },
    [getBookByHash],
  );

  const onOpenThread = useCallback(
    (thread: QAThread) => {
      const book = getBookByHash(thread.bookHash);
      if (!book || book.deletedAt) return;
      void openBook(book, thread.selectionCfi, { threadId: thread.id });
    },
    [getBookByHash, openBook],
  );

  if (!insets) return null;

  return (
    <div
      className={clsx(
        'flex h-screen w-full flex-col',
        isRoundedWindow && 'rounded-window',
        'bg-base-200',
      )}
    >
      <div
        ref={headerRef}
        className={clsx(
          'titlebar z-10 flex h-[52px] w-full shrink-0 items-center py-2 pr-4 sm:h-[44px]',
          isTrafficLightVisible ? 'pl-16' : 'pl-2',
        )}
        style={{
          marginTop: appService?.hasSafeAreaInset ? `${insets.top}px` : '0px',
        }}
      >
        <button
          type='button'
          aria-label={_('Go Back')}
          onClick={goBack}
          className='btn btn-ghost h-10 min-h-10 w-10 p-0 sm:h-8 sm:min-h-8 sm:w-8'
        >
          <IoArrowBack className='text-base-content' />
        </button>
        <h1 className='text-base-content ms-1 flex-1 truncate text-base font-medium sm:text-sm'>
          {_('Questions')}
        </h1>
        {appService?.hasWindowBar ? (
          <WindowButtons
            headerRef={headerRef}
            showMinimize={!isTrafficLightVisible}
            showMaximize={!isTrafficLightVisible}
            showClose={!isTrafficLightVisible}
            onClose={goBack}
          />
        ) : null}
      </div>

      <div className='relative min-h-0 flex-1'>
        {!libraryLoaded ? (
          <div className='flex h-40 items-center justify-center'>
            <div className='border-primary size-5 animate-spin rounded-full border-2 border-t-transparent' />
          </div>
        ) : (
          <HistoryList resolveBookPresent={resolveBookPresent} onOpenThread={onOpenThread} />
        )}
      </div>
    </div>
  );
}
