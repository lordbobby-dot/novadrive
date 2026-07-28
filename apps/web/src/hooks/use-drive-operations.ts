"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { DeleteFolderResponse, FileResponse, FolderResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

/** Move/copy/delete each touch at least two folders' listings (source + destination) plus
 * whichever file/folder detail queries exist — broad invalidation is simpler and safer here
 * than trying to enumerate every affected key precisely. */
function useInvalidateDrive() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["folders"] });
    void queryClient.invalidateQueries({ queryKey: ["files"] });
  };
}

export function useMoveFolder() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateDrive();
  return useMutation({
    mutationFn: ({ id, targetParentId }: { id: string; targetParentId: string }) =>
      authedFetch<FolderResponse>(`/folders/${id}/move`, {
        method: "PATCH",
        body: JSON.stringify({ targetParentId }),
      }),
    onSuccess: invalidate,
  });
}

export function useCopyFolder() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateDrive();
  return useMutation({
    mutationFn: ({
      id,
      targetParentId,
      name,
    }: {
      id: string;
      targetParentId: string;
      name?: string;
    }) =>
      authedFetch<FolderResponse>(`/folders/${id}/copy`, {
        method: "POST",
        body: JSON.stringify({ targetParentId, name }),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteFolder() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateDrive();
  return useMutation({
    mutationFn: (id: string) =>
      authedFetch<DeleteFolderResponse>(`/folders/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useMoveFile() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateDrive();
  return useMutation({
    mutationFn: ({ id, targetFolderId }: { id: string; targetFolderId: string }) =>
      authedFetch<FileResponse>(`/files/${id}/move`, {
        method: "PATCH",
        body: JSON.stringify({ targetFolderId }),
      }),
    onSuccess: invalidate,
  });
}

export function useCopyFile() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateDrive();
  return useMutation({
    mutationFn: ({
      id,
      targetFolderId,
      name,
    }: {
      id: string;
      targetFolderId: string;
      name?: string;
    }) =>
      authedFetch<FileResponse>(`/files/${id}/copy`, {
        method: "POST",
        body: JSON.stringify({ targetFolderId, name }),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteFile() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateDrive();
  return useMutation({
    mutationFn: (id: string) => authedFetch<void>(`/files/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
