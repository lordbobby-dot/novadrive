"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FavoritedIdsResponse, SearchResultPageResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface FavoritesParams {
  cursor?: string;
  limit?: number;
}

function buildQueryString(params: FavoritesParams): string {
  const search = new URLSearchParams();
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  return search.toString();
}

export function useFavorites(params: FavoritesParams = {}) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["favorites", params],
    queryFn: () =>
      authedFetch<SearchResultPageResponse>(`/favorites?${buildQueryString(params)}`),
  });
}

/** Batched star-state check scoped to exactly the file/folder ids the caller is currently
 * rendering (a page of Drive listing, search results, or Recent) — one request per page, no
 * per-row N+1, and no cap on the caller's total favorite count. This replaced an earlier version
 * that instead fetched the owner's 100 most-recently-favorited items globally and checked
 * membership in that capped set: anything favorited earlier than the 100 most recent silently
 * rendered as unfavorited, even though it genuinely was. The dedicated Favorites page itself uses
 * useFavorites directly with real pagination, not this hook. */
export function useFavoritedStatus(fileIds: string[], folderIds: string[]) {
  const authedFetch = useAuthedFetch();
  const hasIds = fileIds.length > 0 || folderIds.length > 0;
  const { data } = useQuery({
    queryKey: ["favorites", "status", fileIds, folderIds],
    queryFn: () => {
      const search = new URLSearchParams();
      if (fileIds.length) search.set("fileIds", fileIds.join(","));
      if (folderIds.length) search.set("folderIds", folderIds.join(","));
      return authedFetch<FavoritedIdsResponse>(`/favorites/check?${search.toString()}`);
    },
    enabled: hasIds,
  });
  return useMemo(() => {
    const set = new Set<string>();
    for (const id of data?.fileIds ?? []) set.add(`file:${id}`);
    for (const id of data?.folderIds ?? []) set.add(`folder:${id}`);
    return set;
  }, [data]);
}

export function useToggleFavorite() {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      type,
      id,
      favorited,
    }: {
      type: "file" | "folder";
      id: string;
      favorited: boolean;
    }) =>
      authedFetch<void>(
        `/${type === "file" ? "files" : "folders"}/${id}/favorite`,
        { method: favorited ? "PUT" : "DELETE" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
}
