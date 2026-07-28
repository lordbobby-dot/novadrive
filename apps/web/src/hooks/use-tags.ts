"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TagResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function useTags() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => authedFetch<TagResponse[]>("/tags"),
  });
}

export function useFileTags(fileId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["files", fileId, "tags"],
    queryFn: () => authedFetch<TagResponse[]>(`/files/${fileId}/tags`),
    enabled: Boolean(fileId),
  });
}

export function useFolderTags(folderId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["folders", folderId, "tags"],
    queryFn: () => authedFetch<TagResponse[]>(`/folders/${folderId}/tags`),
    enabled: Boolean(folderId),
  });
}

export function useSetFileTags(fileId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) =>
      authedFetch<TagResponse[]>(`/files/${fileId}/tags`, {
        method: "PUT",
        body: JSON.stringify({ names }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", fileId, "tags"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}

export function useSetFolderTags(folderId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (names: string[]) =>
      authedFetch<TagResponse[]>(`/folders/${folderId}/tags`, {
        method: "PUT",
        body: JSON.stringify({ names }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["folders", folderId, "tags"] });
      void queryClient.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
