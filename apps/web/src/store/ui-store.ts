import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "grid" | "list";

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** The mobile slide-in nav drawer (sidebar becomes an overlay below the `md` breakpoint) —
   * deliberately not persisted, it should always start closed on load. */
  mobileNavOpen: boolean;
  toggleMobileNav: () => void;
  closeMobileNav: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      viewMode: "grid",
      setViewMode: (mode) => set({ viewMode: mode }),
      mobileNavOpen: false,
      toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),
      closeMobileNav: () => set({ mobileNavOpen: false }),
    }),
    { name: "novadrive-ui", partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed, viewMode: state.viewMode }) },
  ),
);
