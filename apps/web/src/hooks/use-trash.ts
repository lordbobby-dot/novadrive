"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CursorPage, FileResponse, FolderResponse, TrashItemResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function useTrash() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["trash"],
    queryFn: () => authedFetch<CursorPage<TrashItemResponse>>("/trash?limit=100"),
  });
}

function useInvalidateTrash() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["trash"] });
    void queryClient.invalidateQueries({ queryKey: ["folders"] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };
}

export function useRestoreFile() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateTrash();
  return useMutation({
    mutationFn: (id: string) =>
      authedFetch<FileResponse>(`/files/${id}/restore`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function useRestoreFolder() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateTrash();
  return useMutation({
    mutationFn: (id: string) =>
      authedFetch<FolderResponse>(`/folders/${id}/restore`, { method: "POST" }),
    onSuccess: invalidate,
  });
}

export function usePermanentDelete() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateTrash();
  return useMutation({
    mutationFn: (trashId: string) =>
      authedFetch<void>(`/trash/${trashId}/permanent`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
