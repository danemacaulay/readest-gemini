'use client';

import clsx from 'clsx';
import dayjs from 'dayjs';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { IoArrowBack } from 'react-icons/io5';
import { LuRadio, LuTrash2 } from 'react-icons/lu';

import Dialog from '@/components/Dialog';
import { EchoesIcon } from '@/components/echoes/EchoesIcon';
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
import { fileSystemFromAppService } from '@/services/ai/fileSystemFromAppService';
import { getPersistentEchoStore, type EchoStore } from '@/services/echoes/echoStore';
import {
  deleteEchoTrail,
  orphanedPromotedTrails,
  tombstoneEchoStubs,
} from '@/services/echoes/echoSync';
import {
  echoTrailTitle,
  filterPromotedEchoes,
  seedBookLabel,
  type EchoesListFilter,
} from '@/services/echoes/filterEchoes';
import { planOpenEchoBook } from '@/services/echoes/openEchoBook';
import type { EchoTrail } from '@/services/echoes/types';
import type { BookNote } from '@/types/book';
import { useEchoesUiStore } from '@/store/echoesUiStore';
import { openEchoesSidebar, requestOpenEchoesSidebar } from '@/app/reader/utils/openEchoesSidebar';
import { useReaderStore } from '@/store/readerStore';
import { eventDispatcher } from '@/utils/event';
import { focusExistingReaderWindow, navigateToLibrary } from '@/utils/nav';
import { emitTo } from '@tauri-apps/api/event';
import { useBookTransferActions } from '../hooks/useBookTransferActions';
import { useOpenBook } from '../hooks/useOpenBook';

const FILTERS: { id: EchoesListFilter; labelKey: string }[] = [
  { id: 'all', labelKey: 'All' },
  { id: 'recent', labelKey: 'Recent' },
  { id: 'by-seed-book', labelKey: 'By seed book' },
];

/**
 * Library-owned promoted Echo trails. Opens the seed book via {@link useOpenBook}.
 */
export default function EchoesPage() {
  const _ = useTranslation();
  const router = useAppRouter();
  const { envConfig, appService } = useEnv();
  const { libraryLoaded } = useLibrary();
  const { getBookByHash, updateBook } = useLibraryStore();
  const { settings } = useSettingsStore();
  const { safeAreaInsets: insets, isRoundedWindow } = useThemeStore();
  const headerRef = useRef<HTMLDivElement>(null);
  const { isTrafficLightVisible } = useTrafficLight(headerRef);
  const [, setLoading] = useState(false);
  const { handleBookDownload } = useBookTransferActions(
    envConfig,
    appService,
    updateBook,
    () => {},
  );
  const { openBook } = useOpenBook({ setLoading, handleBookDownload });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<EchoesListFilter>('all');
  const [trails, setTrails] = useState<EchoTrail[]>([]);
  const [loading, setListLoading] = useState(true);
  const [detail, setDetail] = useState<EchoTrail | null>(null);
  const storeRef = useRef<EchoStore | null>(null);

  useTheme({ systemUIVisible: true, appThemeColor: 'base-200' });

  const getStore = useCallback((): EchoStore | null => {
    if (!appService) return null;
    if (!storeRef.current) {
      storeRef.current = getPersistentEchoStore(fileSystemFromAppService(appService));
    }
    return storeRef.current;
  }, [appService]);

  const reconcileOrphans = useCallback(
    async (store: EchoStore, listed: EchoTrail[]): Promise<EchoTrail[]> => {
      if (!appService) return listed;
      const promoted = listed.filter((t) => t.status === 'promoted');
      const hashes = [...new Set(promoted.map((t) => t.seed.bookHash))];
      const booknotesByHash = new Map<string, BookNote[] | undefined>();

      await Promise.all(
        hashes.map(async (hash) => {
          const book = getBookByHash(hash);
          if (!book || book.deletedAt) {
            // No book → keep trail (shown as "book not found" on open).
            return;
          }
          try {
            const config = await appService.loadBookConfig(book, settings);
            booknotesByHash.set(hash, config.booknotes ?? []);
          } catch {
            // Config unreadable — skip reconcile for this book.
          }
        }),
      );

      const orphans = orphanedPromotedTrails(listed, booknotesByHash);
      for (const orphan of orphans) {
        await deleteEchoTrail(store, orphan.id);
      }
      if (orphans.length === 0) return listed;
      return listed.filter((t) => !orphans.some((o) => o.id === t.id));
    },
    [appService, getBookByHash, settings],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async (opts?: { quiet?: boolean }) => {
      const store = getStore();
      if (!store) return;
      if (!opts?.quiet) setListLoading(true);
      try {
        const next = await store.list();
        const reconciled = await reconcileOrphans(store, next);
        if (!cancelled) setTrails(reconciled);
      } finally {
        if (!cancelled && !opts?.quiet) setListLoading(false);
      }
    };
    void load();
    // Reader promotes write from another webview; refresh when this window
    // is focused again so the list is not stuck on the first mount snapshot.
    const onFocus = () => void load({ quiet: true });
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [getStore, reconcileOrphans]);

  const handleDeleteTrail = useCallback(
    async (trail: EchoTrail, event: MouseEvent | KeyboardEvent) => {
      event.stopPropagation();
      event.preventDefault();
      const store = getStore();
      if (!store) return;

      await deleteEchoTrail(store, trail.id);

      const book = getBookByHash(trail.seed.bookHash);
      if (book && !book.deletedAt && appService) {
        try {
          const config = await appService.loadBookConfig(book, settings);
          const booknotes = tombstoneEchoStubs(
            config.booknotes ?? [],
            trail.id,
            trail.noteId,
            Date.now(),
          );
          await appService.saveBookConfig(book, { ...config, booknotes }, settings);
        } catch {
          // Trail is gone; stub may linger until next book open.
        }
      }

      setTrails((prev) => prev.filter((t) => t.id !== trail.id));
      if (detail?.id === trail.id) setDetail(null);
      if (useEchoesUiStore.getState().activeEchoId === trail.id) {
        useEchoesUiStore.getState().setActiveEchoId(null);
      }
    },
    [appService, detail?.id, getBookByHash, getStore, settings],
  );

  const visible = useMemo(
    () => filterPromotedEchoes(trails, { query, filter }),
    [trails, query, filter],
  );

  const goBack = () => {
    document.documentElement.setAttribute('data-nav-direction', 'back');
    navigateToLibrary(router);
  };

  const handleOpenTrail = useCallback(
    (trail: EchoTrail) => {
      const book = getBookByHash(trail.seed.bookHash);
      if (!book || book.deletedAt) {
        setDetail(trail);
        return;
      }

      useEchoesUiStore.getState().setActiveEchoId(trail.id);
      requestOpenEchoesSidebar();

      void (async () => {
        // Other Tauri windows have isolated Zustand stores — prefer focusing
        // a reader that already published this book hash.
        const existingLabel = await focusExistingReaderWindow(book.hash);
        if (existingLabel) {
          await emitTo(existingLabel, 'reader-open-echo', {
            bookHash: book.hash,
            trailId: trail.id,
            cfi: trail.seed.cfi,
          });
          return;
        }

        const readerMounted =
          typeof window !== 'undefined' && window.location.pathname.startsWith('/reader');
        const plan = planOpenEchoBook({
          bookHash: book.hash,
          bookKeys: useReaderStore.getState().bookKeys,
          readerMounted,
        });

        if (plan.action === 'focus-existing' || plan.action === 'switch-in-reader') {
          eventDispatcher.dispatch('open-book-in-reader', {
            bookHash: book.hash,
            cfi: trail.seed.cfi,
          });
          const bookKey =
            useReaderStore.getState().bookKeys.find((key) => key.split('-')[0] === book.hash) ??
            book.hash;
          openEchoesSidebar(bookKey);
          return;
        }

        // activeEchoId is already set; reader opens Echoes via openEchoesSidebar
        // when the book mounts (see SideBar / Content restore).
        void openBook(book, trail.seed.cfi);
      })();
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
          {_('Echoes')}
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
          <div className='flex h-full min-h-0 flex-1 flex-col'>
            <div className='flex shrink-0 flex-col gap-2 px-4 py-3'>
              <input
                type='search'
                className='input input-bordered input-sm eink-bordered w-full'
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={_('Search trails…')}
                aria-label={_('Search trails')}
              />
              <div className='flex flex-wrap gap-2' role='group' aria-label={_('Filter trails')}>
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type='button'
                    className={clsx(
                      'btn btn-sm rounded-full',
                      filter === f.id ? 'btn-contrast' : 'btn-ghost eink-bordered',
                    )}
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                  >
                    {_(f.labelKey)}
                  </button>
                ))}
              </div>
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto'>
              {loading ? (
                <div className='flex h-40 items-center justify-center'>
                  <div className='border-primary size-5 animate-spin rounded-full border-2 border-t-transparent' />
                </div>
              ) : visible.length === 0 ? (
                <div className='flex h-40 flex-col items-center justify-center gap-2 px-4 text-center'>
                  <div className='bg-base-300/50 rounded-full p-3'>
                    <EchoesIcon className='text-base-content/50' size={24} />
                  </div>
                  <p className='text-base-content/70 text-sm'>
                    {query.trim() || filter !== 'all'
                      ? _('No matching echoes')
                      : _('No saved echoes yet')}
                  </p>
                </div>
              ) : (
                <ul className='divide-base-300/30 divide-y'>
                  {visible.map((trail, index) => {
                    const bookLabel = seedBookLabel(trail);
                    const prevLabel = index > 0 ? seedBookLabel(visible[index - 1]!) : null;
                    const showGroup = filter === 'by-seed-book' && bookLabel !== prevLabel;
                    const sourceLabels = trail.sources
                      .map((s) => s.bookTitle || s.title)
                      .filter(Boolean);
                    const uniqueSources = [...new Set(sourceLabels)].slice(0, 4);

                    return (
                      <li key={trail.id}>
                        {showGroup ? (
                          <div className='text-base-content/50 bg-base-200 sticky top-0 px-4 py-2 text-xs font-medium tracking-wide uppercase'>
                            {bookLabel}
                          </div>
                        ) : null}
                        <div
                          className={clsx(
                            'group flex cursor-pointer items-start gap-2 px-4 py-3',
                            'hover:bg-base-300/50 not-eink:transition-colors duration-150',
                          )}
                          role='button'
                          tabIndex={0}
                          onClick={() => handleOpenTrail(trail)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleOpenTrail(trail);
                            }
                          }}
                        >
                          <div className='text-base-content/40 mt-0.5 shrink-0'>
                            <LuRadio size={16} aria-hidden />
                          </div>
                          <div className='min-w-0 flex-1'>
                            <p className='text-base-content line-clamp-2 text-sm font-medium'>
                              {echoTrailTitle(trail)}
                            </p>
                            <div className='text-base-content/50 mt-1 flex flex-wrap items-center gap-2 text-xs'>
                              <span className='line-clamp-1'>{bookLabel}</span>
                              <span aria-hidden='true'>·</span>
                              <span>{dayjs(trail.updatedAt).format('YYYY-MM-DD')}</span>
                            </div>
                            {uniqueSources.length > 0 ? (
                              <div className='mt-2 flex flex-wrap gap-1.5'>
                                {uniqueSources.map((label) => (
                                  <span
                                    key={label}
                                    className='badge badge-outline badge-xs eink-bordered max-w-40 truncate'
                                    title={label}
                                  >
                                    {label}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type='button'
                            className='btn btn-ghost btn-square btn-sm text-base-content/40 hover:text-error shrink-0 opacity-70 group-hover:opacity-100'
                            aria-label={_('Delete echo')}
                            title={_('Delete echo')}
                            onClick={(e) => void handleDeleteTrail(trail, e)}
                          >
                            <LuTrash2 size={16} />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      <Dialog
        isOpen={!!detail}
        title={detail ? echoTrailTitle(detail) : _('Echoes')}
        onClose={() => setDetail(null)}
        boxClassName='sm:min-w-[32rem] sm:max-w-xl'
        contentClassName='flex min-h-0 flex-1 flex-col'
      >
        {detail ? (
          <div className='flex min-h-48 flex-1 flex-col gap-3 px-4 py-3'>
            <p className='text-warning text-sm'>{_('Book file not found')}</p>
            <p className='text-base-content/50 text-xs'>{seedBookLabel(detail)}</p>
            {detail.synthesis ? (
              <p className='text-base-content whitespace-pre-wrap text-sm'>{detail.synthesis}</p>
            ) : null}
            {detail.sources.length > 0 ? (
              <ul className='flex flex-wrap gap-2'>
                {detail.sources.map((s) => (
                  <li
                    key={s.id}
                    title={s.snippet}
                    className='eink-bordered rounded border px-2 py-1 text-xs'
                  >
                    {s.bookTitle || s.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
