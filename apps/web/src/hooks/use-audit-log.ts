"use client";

import { useQuery } from "@tanstack/react-query";
import type { AuditEventType, AuditLogResponse, CursorPage } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface AuditLogFilters {
  eventType?: AuditEventType;
  cursor?: string;
  limit?: number;
}

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.eventType) params.set("eventType", filters.eventType);
  if (filters.cursor) params.set("cursor", filters.cursor);
  params.set("limit", String(filters.limit ?? 20));
  return params.toString();
}

export function useAuditLog(filters: AuditLogFilters) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["audit-log", filters],
    queryFn: () => authedFetch<CursorPage<AuditLogResponse>>(`/audit-log?${buildQuery(filters)}`),
  });
}
