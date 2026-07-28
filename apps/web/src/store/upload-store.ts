import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UploadItemStatus =
  | "queued"
  | "uploading"
  | "paused"
  | "completing"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "quarantined";

export interface UploadItem {
  id: string;
  name: string;
  folderId: string;
  size: number;
  status: UploadItemStatus;
  progress: number;
  error?: string;
  /** Set when this upload is a new version of an existing file rather than a new file. */
  versionOfFileId?: string;
}

interface UploadStoreState {
  items: Record<string, UploadItem>;
  upsert: (item: UploadItem) => void;
  update: (id: string, patch: Partial<UploadItem>) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
}

export const useUploadStore = create<UploadStoreState>()(
  persist(
    (set) => ({
      items: {},
      upsert: (item) => set((state) => ({ items: { ...state.items, [item.id]: item } })),
      update: (id, patch) =>
        set((state) => {
          const existing = state.items[id];
          if (!existing) return state;
          return { items: { ...state.items, [id]: { ...existing, ...patch } } };
        }),
      remove: (id) =>
        set((state) => {
          const next = { ...state.items };
          delete next[id];
          return { items: next };
        }),
      clearFinished: () =>
        set((state) => {
          const next: Record<string, UploadItem> = {};
          for (const [id, item] of Object.entries(state.items)) {
            if (
              item.status !== "completed" &&
              item.status !== "cancelled" &&
              item.status !== "quarantined"
            ) {
              next[id] = item;
            }
          }
          return { items: next };
        }),
    }),
    {
      name: "novadrive-uploads",
      // On reload we lose the in-memory File object; anything still "uploading" is stuck
      // forever otherwise, so mark it interrupted and let the user retry by re-selecting it.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        for (const item of Object.values(state.items)) {
          if (item.status === "uploading" || item.status === "queued" || item.status === "paused") {
            item.status = "interrupted";
          }
        }
      },
    },
  ),
);
