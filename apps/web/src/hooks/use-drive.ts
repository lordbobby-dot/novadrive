"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CursorPage,
  FileResponse,
  FolderResponse,
  SignedUrlResponse,
} from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function useRootFolder() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["folders", "root"],
    queryFn: () => authedFetch<FolderResponse>("/folders/root"),
  });
}

export function useFolder(folderId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["folders", folderId],
    queryFn: () => authedFetch<FolderResponse>(`/folders/${folderId}`),
    enabled: Boolean(folderId),
  });
}

export function useBreadcrumb(folderId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["folders", folderId, "breadcrumb"],
    queryFn: () => authedFetch<FolderResponse[]>(`/folders/${folderId}/breadcrumb`),
    enabled: Boolean(folderId),
  });
}

export function useFolderChildren(folderId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["folders", folderId, "children"],
    queryFn: () => authedFetch<CursorPage<FolderResponse>>(`/folders/${folderId}/children?limit=100`),
    enabled: Boolean(folderId),
  });
}

export function useFilesByFolder(folderId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["files", "byFolder", folderId],
    queryFn: () => authedFetch<CursorPage<FileResponse>>(`/files?folderId=${folderId}&limit=100`),
    enabled: Boolean(folderId),
  });
}

export function useCreateFolder(parentId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      authedFetch<FolderResponse>("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parentId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folders", parentId, "children"] });
    },
  });
}

export function usePreviewUrl(fileId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["files", fileId, "preview-url"],
    queryFn: () => authedFetch<SignedUrlResponse>(`/files/${fileId}/preview-url`),
    enabled: Boolean(fileId),
    // Signed URLs are short-lived (5 min server-side) — don't serve a stale one from cache.
    staleTime: 0,
  });
}

export function useDownloadFile() {
  const authedFetch = useAuthedFetch();
  return useMutation({
    mutationFn: (fileId: string) =>
      authedFetch<SignedUrlResponse>(`/files/${fileId}/download-url`),
  });
}

export function useRenameFolder(folderId: string, parentId: string | null) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      authedFetch<FolderResponse>(`/folders/${folderId}/rename`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folders", parentId, "children"] });
      void queryClient.invalidateQueries({ queryKey: ["folders", folderId] });
    },
  });
}
