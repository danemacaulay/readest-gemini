import { create } from 'zustand';
import type { MetaWillSectionId } from '@/types/book';

interface MetaWillUiState {
  focusedSectionId: MetaWillSectionId | null;
  setFocusedSectionId: (focusedSectionId: MetaWillSectionId | null) => void;
}

export const useMetaWillUiStore = create<MetaWillUiState>((set) => ({
  focusedSectionId: null,
  setFocusedSectionId: (focusedSectionId) => set({ focusedSectionId }),
}));
