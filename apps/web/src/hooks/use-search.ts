"use client";

import { useQuery } from "@tanstack/react-query";
import type { SearchResultPageResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface SearchParams {
  q: string;
  type?: "file" | "folder";
  dateFrom?: string;
  dateTo?: string;
  tag?: string;
  /** Search within this workspace's shared content instead of personal Drive. */
  workspaceId?: string;
  /** Only within workspaceId — restrict to one member's uploads. */
  owner?: string;
  /** Restrict to this folder's subtree. */
  folderId?: string;
  cursor?: string;
  limit?: number;
}

function buildQueryString(params: SearchParams): string {
  const search = new URLSearchParams({ q: params.q });
  if (params.type) search.set("type", params.type);
  if (params.dateFrom) search.set("dateFrom", params.dateFrom);
  if (params.dateTo) search.set("dateTo", params.dateTo);
  if (params.tag) search.set("tag", params.tag);
  if (params.workspaceId) search.set("workspaceId", params.workspaceId);
  if (params.owner) search.set("owner", params.owner);
  if (params.folderId) search.set("folderId", params.folderId);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  return search.toString();
}

export function useSearch(params: SearchParams) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["search", params],
    queryFn: () =>
      authedFetch<SearchResultPageResponse>(`/search?${buildQueryString(params)}`),
    enabled: params.q.trim().length > 0,
  });
}
