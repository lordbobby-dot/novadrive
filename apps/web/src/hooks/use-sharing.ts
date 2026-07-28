"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  InvitationResponse,
  PermissionResponse,
  PermissionRole,
  ResourceType,
  SharedLinkResponse,
} from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

function resourcePath(resourceType: ResourceType, resourceId: string) {
  return `/resources/${resourceType.toLowerCase()}/${resourceId}`;
}

function useInvalidateSharing(resourceType: ResourceType, resourceId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({
      queryKey: ["sharing", resourceType, resourceId],
    });
  };
}

export function usePermissions(resourceType: ResourceType, resourceId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["sharing", resourceType, resourceId, "permissions"],
    queryFn: () =>
      authedFetch<PermissionResponse[]>(`${resourcePath(resourceType, resourceId!)}/permissions`),
    enabled: Boolean(resourceId),
  });
}

export function useInvitations(resourceType: ResourceType, resourceId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["sharing", resourceType, resourceId, "invitations"],
    queryFn: () =>
      authedFetch<InvitationResponse[]>(`${resourcePath(resourceType, resourceId!)}/invitations`),
    enabled: Boolean(resourceId),
  });
}

export function useSharedLinks(resourceType: ResourceType, resourceId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["sharing", resourceType, resourceId, "shared-links"],
    queryFn: () =>
      authedFetch<SharedLinkResponse[]>(`${resourcePath(resourceType, resourceId!)}/shared-links`),
    enabled: Boolean(resourceId),
  });
}

export function useGrantPermission(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateSharing(resourceType, resourceId);
  return useMutation({
    mutationFn: ({ subjectId, role }: { subjectId: string; role: PermissionRole }) =>
      authedFetch<PermissionResponse>("/permissions", {
        method: "POST",
        body: JSON.stringify({ subjectId, resourceType, resourceId, role }),
      }),
    onSuccess: invalidate,
  });
}

export function useRevokePermission(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateSharing(resourceType, resourceId);
  return useMutation({
    mutationFn: (permissionId: string) =>
      authedFetch<void>(`/permissions/${permissionId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export function useCreateInvitation(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateSharing(resourceType, resourceId);
  return useMutation({
    mutationFn: ({ email, role }: { email: string; role: PermissionRole }) =>
      authedFetch<InvitationResponse>("/invitations", {
        method: "POST",
        body: JSON.stringify({ email, resourceType, resourceId, role }),
      }),
    onSuccess: invalidate,
  });
}

export function useRevokeInvitation(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateSharing(resourceType, resourceId);
  return useMutation({
    mutationFn: (invitationId: string) =>
      authedFetch<void>(`/invitations/${invitationId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}

export interface CreateSharedLinkParams {
  password?: string;
  expiresAt?: string;
  maxDownloads?: number;
  canDownload?: boolean;
}

export function useCreateSharedLink(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateSharing(resourceType, resourceId);
  return useMutation({
    mutationFn: (params: CreateSharedLinkParams) =>
      authedFetch<SharedLinkResponse>("/shared-links", {
        method: "POST",
        body: JSON.stringify({ resourceType, resourceId, ...params }),
      }),
    onSuccess: invalidate,
  });
}

export function useRevokeSharedLink(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateSharing(resourceType, resourceId);
  return useMutation({
    mutationFn: (linkId: string) =>
      authedFetch<void>(`/shared-links/${linkId}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
