import { create } from 'zustand';

interface UIState {
  isSidebarOpen: boolean;
  activeModals: Record<string, boolean>;
  toggleSidebar: () => void;
  openModal: (id: string) => void;
  closeModal: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isSidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  activeModals: {},
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  openModal: (id) => set((state) => ({ 
    activeModals: { ...state.activeModals, [id]: true } 
  })),
  closeModal: (id) => set((state) => ({ 
    activeModals: { ...state.activeModals, [id]: false } 
  })),
}));
