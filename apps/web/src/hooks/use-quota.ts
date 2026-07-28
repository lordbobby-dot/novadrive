"use client";

import { useQuery } from "@tanstack/react-query";
import type { QuotaResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function usePersonalQuota() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["quota", "personal"],
    queryFn: () => authedFetch<QuotaResponse>("/quota"),
  });
}

export function useOrganizationQuota(organizationId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["quota", "organization", organizationId],
    queryFn: () => authedFetch<QuotaResponse>(`/organizations/${organizationId}/quota`),
    enabled: Boolean(organizationId),
  });
}
