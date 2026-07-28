"use client";

import { useQuery } from "@tanstack/react-query";
import type { ActivityAction, ActivityResponse, CursorPage } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface ActivityFilters {
  targetId?: string;
  action?: ActivityAction;
  dateFrom?: string;
  dateTo?: string;
  cursor?: string;
  limit?: number;
}

function buildQuery(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.targetId) params.set("targetId", filters.targetId);
  if (filters.action) params.set("action", filters.action);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.cursor) params.set("cursor", filters.cursor);
  params.set("limit", String(filters.limit ?? 20));
  return params.toString();
}

export function useActivity(filters: ActivityFilters) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["activity", filters],
    queryFn: () => authedFetch<CursorPage<ActivityResponse>>(`/activity?${buildQuery(filters)}`),
  });
}
