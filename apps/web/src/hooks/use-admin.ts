"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AdminAnalyticsResponse,
  AdminOrganizationDetailResponse,
  AdminOrganizationResponse,
  AdminUserResponse,
  AuditEventType,
  AuditLogResponse,
  CursorPage,
  PermissionRole,
  SystemHealthResponse,
} from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export interface AdminUsersParams {
  search?: string;
  cursor?: string;
  limit?: number;
}

function buildAdminUsersQuery(params: AdminUsersParams): string {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.cursor) search.set("cursor", params.cursor);
  search.set("limit", String(params.limit ?? 20));
  return search.toString();
}

export function useAdminUsers(params: AdminUsersParams) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["admin", "users", params],
    queryFn: () =>
      authedFetch<CursorPage<AdminUserResponse>>(
        `/admin/users?${buildAdminUsersQuery(params)}`,
      ),
  });
}

function useInvalidateAdminUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
}

export function useSuspendUser() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: (userId: string) =>
      authedFetch<AdminUserResponse>(`/admin/users/${userId}/suspend`, {
        method: "PATCH",
      }),
    onSuccess: invalidate,
  });
}

export function useUnsuspendUser() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: (userId: string) =>
      authedFetch<AdminUserResponse>(`/admin/users/${userId}/unsuspend`, {
        method: "PATCH",
      }),
    onSuccess: invalidate,
  });
}

export function useSetSystemAdmin() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: ({ userId, isSystemAdmin }: { userId: string; isSystemAdmin: boolean }) =>
      authedFetch<AdminUserResponse>(`/admin/users/${userId}/system-role`, {
        method: "PATCH",
        body: JSON.stringify({ isSystemAdmin }),
      }),
    onSuccess: invalidate,
  });
}

export function useSetUserQuota() {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminUsers();
  return useMutation({
    mutationFn: ({ userId, limitBytes }: { userId: string; limitBytes: string }) =>
      authedFetch<AdminUserResponse>(`/admin/users/${userId}/quota`, {
        method: "PATCH",
        body: JSON.stringify({ limitBytes }),
      }),
    onSuccess: invalidate,
  });
}

export interface AdminOrganizationsParams {
  search?: string;
  cursor?: string;
  limit?: number;
}

function buildAdminOrgsQuery(params: AdminOrganizationsParams): string {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.cursor) search.set("cursor", params.cursor);
  search.set("limit", String(params.limit ?? 20));
  return search.toString();
}

export function useAdminOrganizations(params: AdminOrganizationsParams) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["admin", "organizations", params],
    queryFn: () =>
      authedFetch<CursorPage<AdminOrganizationResponse>>(
        `/admin/organizations?${buildAdminOrgsQuery(params)}`,
      ),
  });
}

export function useAdminOrganizationDetail(organizationId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["admin", "organizations", organizationId],
    queryFn: () =>
      authedFetch<AdminOrganizationDetailResponse>(
        `/admin/organizations/${organizationId}`,
      ),
    enabled: Boolean(organizationId),
  });
}

function useInvalidateAdminOrganization(organizationId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] });
    void queryClient.invalidateQueries({
      queryKey: ["admin", "organizations", organizationId],
    });
  };
}

export function useSetOrganizationQuota(organizationId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminOrganization(organizationId);
  return useMutation({
    mutationFn: (limitBytes: string) =>
      authedFetch<AdminOrganizationResponse>(
        `/admin/organizations/${organizationId}/quota`,
        { method: "PATCH", body: JSON.stringify({ limitBytes }) },
      ),
    onSuccess: invalidate,
  });
}

export function useTransferOrganizationOwnership(organizationId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminOrganization(organizationId);
  return useMutation({
    mutationFn: (newOwnerId: string) =>
      authedFetch<AdminOrganizationResponse>(
        `/admin/organizations/${organizationId}/owner`,
        { method: "PATCH", body: JSON.stringify({ newOwnerId }) },
      ),
    onSuccess: invalidate,
  });
}

export function useAdminChangeMemberRole(organizationId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminOrganization(organizationId);
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: PermissionRole }) =>
      authedFetch<void>(
        `/admin/organizations/${organizationId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    onSuccess: invalidate,
  });
}

export function useAdminRemoveMember(organizationId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateAdminOrganization(organizationId);
  return useMutation({
    mutationFn: (userId: string) =>
      authedFetch<void>(
        `/admin/organizations/${organizationId}/members/${userId}`,
        { method: "DELETE" },
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteOrganization() {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (organizationId: string) =>
      authedFetch<void>(`/admin/organizations/${organizationId}`, {
        method: "DELETE",
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["admin", "organizations"] }),
  });
}

export interface AdminAuditLogParams {
  actorId?: string;
  eventType?: AuditEventType;
  targetType?: string;
  cursor?: string;
  limit?: number;
}

function buildAdminAuditLogQuery(params: AdminAuditLogParams): string {
  const search = new URLSearchParams();
  if (params.actorId) search.set("actorId", params.actorId);
  if (params.eventType) search.set("eventType", params.eventType);
  if (params.targetType) search.set("targetType", params.targetType);
  if (params.cursor) search.set("cursor", params.cursor);
  search.set("limit", String(params.limit ?? 20));
  return search.toString();
}

export function useAdminAuditLog(params: AdminAuditLogParams) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["admin", "audit-logs", params],
    queryFn: () =>
      authedFetch<CursorPage<AuditLogResponse>>(
        `/admin/audit-logs?${buildAdminAuditLogQuery(params)}`,
      ),
  });
}

export function useSystemHealth() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["admin", "system-health"],
    queryFn: () => authedFetch<SystemHealthResponse>("/admin/system-health"),
    // Connectivity can change between clicks — a live dashboard, not a cached snapshot.
    staleTime: 0,
    refetchInterval: 30_000,
  });
}

export function useAdminAnalytics(windowDays: number) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["admin", "analytics", windowDays],
    queryFn: () =>
      authedFetch<AdminAnalyticsResponse>(
        `/admin/analytics?windowDays=${windowDays}`,
      ),
  });
}
