"use client";

import { useQuery } from "@tanstack/react-query";
import type { SearchResultPageResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface RecentParams {
  workspaceId?: string;
  cursor?: string;
  limit?: number;
}

function buildQueryString(params: RecentParams): string {
  const search = new URLSearchParams();
  if (params.workspaceId) search.set("workspaceId", params.workspaceId);
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  return search.toString();
}

export function useRecent(params: RecentParams = {}) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["recent", params],
    queryFn: () =>
      authedFetch<SearchResultPageResponse>(`/recent?${buildQueryString(params)}`),
  });
}
