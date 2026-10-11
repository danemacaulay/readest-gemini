import { create } from 'zustand';
import type { EchoTrailSeed } from '@/services/echoes/types';

interface EchoesUiState {
  activeEchoId: string | null;
  pendingSeed: EchoTrailSeed | null;
  isRunning: boolean;
  error: string | null;
  /** Bumps when a new Find Echoes run is requested. */
  runToken: number;
  /** One-shot: open left Echoes tab when the reader sidebar mounts. */
  pendingOpenSidebar: boolean;

  setActiveEchoId: (id: string | null) => void;
  setPendingSeed: (seed: EchoTrailSeed | null) => void;
  setRunning: (running: boolean) => void;
  setError: (error: string | null) => void;
  requestOpenEchoesSidebar: () => void;
  consumeOpenEchoesSidebar: () => boolean;
  /**
   * Open Echoes workbench with a seed and request a new synthesis run.
   * EchoesPanel watches `runToken` + `pendingSeed`.
   */
  requestEchoesRun: (seed: EchoTrailSeed) => void;
  clearEchoesUi: () => void;
}

export const useEchoesUiStore = create<EchoesUiState>((set, get) => ({
  activeEchoId: null,
  pendingSeed: null,
  isRunning: false,
  error: null,
  runToken: 0,
  pendingOpenSidebar: false,

  setActiveEchoId: (id) => set({ activeEchoId: id }),
  setPendingSeed: (seed) => set({ pendingSeed: seed }),
  setRunning: (running) => set({ isRunning: running }),
  setError: (error) => set({ error }),
  requestOpenEchoesSidebar: () => set({ pendingOpenSidebar: true }),
  consumeOpenEchoesSidebar: () => {
    if (!get().pendingOpenSidebar) return false;
    set({ pendingOpenSidebar: false });
    return true;
  },
  requestEchoesRun: (seed) =>
    set((state) => ({
      pendingSeed: seed,
      activeEchoId: null,
      error: null,
      isRunning: false,
      runToken: state.runToken + 1,
      pendingOpenSidebar: true,
    })),
  clearEchoesUi: () =>
    set({
      activeEchoId: null,
      pendingSeed: null,
      isRunning: false,
      error: null,
      pendingOpenSidebar: false,
    }),
}));
