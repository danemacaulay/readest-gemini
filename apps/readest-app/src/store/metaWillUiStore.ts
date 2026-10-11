import { create } from 'zustand';
import type { MetaWill, MetaWillSectionId } from '@/types/book';

interface MetaWillUiState {
  /** Last focused section — sticky for desktop Annotate click-to-link. */
  focusedSectionId: MetaWillSectionId | null;
  /** Live editor draft so Path B does not clobber unsaved text. */
  liveMetaWill: MetaWill | null;
  setFocusedSectionId: (focusedSectionId: MetaWillSectionId | null) => void;
  setLiveMetaWill: (liveMetaWill: MetaWill | null) => void;
}

export const useMetaWillUiStore = create<MetaWillUiState>((set) => ({
  focusedSectionId: null,
  liveMetaWill: null,
  setFocusedSectionId: (focusedSectionId) => set({ focusedSectionId }),
  setLiveMetaWill: (liveMetaWill) => set({ liveMetaWill }),
}));
