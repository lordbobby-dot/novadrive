import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "grid" | "list";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      viewMode: "grid",
      setViewMode: (mode) => set({ viewMode: mode }),
    }),
    { name: "novadrive-ui" },
  ),
);
