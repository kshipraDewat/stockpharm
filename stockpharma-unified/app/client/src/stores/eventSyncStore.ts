import { create } from 'zustand';

interface EventSyncState {
  lastError: string | null;
  setLastError: (message: string | null) => void;
}

export const useEventSyncStore = create<EventSyncState>((set) => ({
  lastError: null,
  setLastError: (lastError) => set({ lastError }),
}));
