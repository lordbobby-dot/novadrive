"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FileResponse, FileVersionResponse, SignedUrlResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function useFileVersions(fileId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["files", fileId, "versions"],
    queryFn: () => authedFetch<FileVersionResponse[]>(`/files/${fileId}/versions`),
    enabled: Boolean(fileId),
  });
}

export function useRestoreFileVersion(fileId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionNumber: number) =>
      authedFetch<FileResponse>(`/files/${fileId}/versions/${versionNumber}/restore`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["files", fileId, "versions"] });
      void queryClient.invalidateQueries({ queryKey: ["folders"] });
      void queryClient.invalidateQueries({ queryKey: ["files"] });
    },
  });
}

export function useVersionDownloadUrl() {
  const authedFetch = useAuthedFetch();
  return useMutation({
    mutationFn: ({ fileId, versionNumber }: { fileId: string; versionNumber: number }) =>
      authedFetch<SignedUrlResponse>(`/files/${fileId}/versions/${versionNumber}/download-url`),
  });
}
