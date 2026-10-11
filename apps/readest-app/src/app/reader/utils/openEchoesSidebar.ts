import { useBookDataStore } from '@/store/bookDataStore';
import { useEchoesUiStore } from '@/store/echoesUiStore';
import { useSidebarStore } from '@/store/sidebarStore';

/** Open the left sidebar on the Echoes tab for the given book. */
export function openEchoesSidebar(bookKey: string): void {
  useSidebarStore.getState().setSideBarVisible(true);
  const { getConfig, setConfig } = useBookDataStore.getState();
  const config = getConfig(bookKey);
  if (!config) return;
  setConfig(bookKey, {
    viewSettings: { ...config.viewSettings, sideBarTab: 'echoes' },
  });
}

/** Queue opening Echoes after the reader/sidebar mounts (e.g. library navigate). */
export function requestOpenEchoesSidebar(): void {
  useEchoesUiStore.getState().requestOpenEchoesSidebar();
}
