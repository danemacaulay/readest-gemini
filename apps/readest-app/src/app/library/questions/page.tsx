'use client';

import clsx from 'clsx';
import { useCallback, useRef } from 'react';
import { IoArrowBack } from 'react-icons/io5';

import HistoryList from '@/components/ask/HistoryList';
import WindowButtons from '@/components/WindowButtons';
import { useEnv } from '@/context/EnvContext';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useLibrary } from '@/hooks/useLibrary';
import { useTheme } from '@/hooks/useTheme';
import { useThemeStore } from '@/store/themeStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTrafficLight } from '@/hooks/useTrafficLight';
import { useTranslation } from '@/hooks/useTranslation';
import type { QAThread } from '@/services/ai/history/types';
import { navigateToLibrary, navigateToReader, showReaderWindow } from '@/utils/nav';

/**
 * Global Ask / Ask-with-library history. Searchable across books; opening a
 * thread jumps to the book (and CFI when available) and restores the panel.
 */
export default function QuestionsPage() {
  const _ = useTranslation();
  const router = useAppRouter();
  const { appService } = useEnv();
  const { libraryLoaded } = useLibrary();
  const { getBookByHash } = useLibraryStore();
  const { settings } = useSettingsStore();
  const { safeAreaInsets: insets, isRoundedWindow } = useThemeStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);

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

      const params = new URLSearchParams();
      if (thread.selectionCfi) params.set('cfi', thread.selectionCfi);
      params.set('threadId', thread.id);
      const queryParams = params.toString();

      if (appService?.hasWindow && settings.openBookInNewWindow) {
        showReaderWindow(appService, [book.hash], queryParams);
      } else {
        setTimeout(() => {
          navigateToReader(router, [book.hash], queryParams);
        }, 0);
      }
    },
    [appService, getBookByHash, router, settings.openBookInNewWindow],
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
