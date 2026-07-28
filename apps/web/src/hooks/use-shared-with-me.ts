"use client";

import { useQuery } from "@tanstack/react-query";
import type { SharedWithMePageResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface SharedWithMeParams {
  cursor?: string;
  limit?: number;
}

function buildQueryString(params: SharedWithMeParams): string {
  const search = new URLSearchParams();
  if (params.cursor) search.set("cursor", params.cursor);
  if (params.limit) search.set("limit", String(params.limit));
  return search.toString();
}

export function useSharedWithMe(params: SharedWithMeParams = {}) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["shared-with-me", params],
    queryFn: () =>
      authedFetch<SharedWithMePageResponse>(`/shared-with-me?${buildQueryString(params)}`),
  });
}
