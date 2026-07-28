"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  FolderResponse,
  OrganizationMemberResponse,
  OrganizationResponse,
  PermissionRole,
  WorkspaceResponse,
} from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function useOrganizations() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => authedFetch<OrganizationResponse[]>("/organizations"),
  });
}

export function useOrganization(orgId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["organizations", orgId],
    queryFn: () => authedFetch<OrganizationResponse>(`/organizations/${orgId}`),
    enabled: Boolean(orgId),
  });
}

export function useCreateOrganization() {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      authedFetch<OrganizationResponse>("/organizations", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
  });
}

export function useWorkspaces(orgId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["organizations", orgId, "workspaces"],
    queryFn: () => authedFetch<WorkspaceResponse[]>(`/organizations/${orgId}/workspaces`),
    enabled: Boolean(orgId),
  });
}

export function useCreateWorkspace(orgId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      authedFetch<WorkspaceResponse>(`/organizations/${orgId}/workspaces`, {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "workspaces"] });
    },
  });
}

export function useWorkspaceRootFolder(workspaceId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["workspaces", workspaceId, "root-folder"],
    queryFn: () => authedFetch<FolderResponse>(`/workspaces/${workspaceId}/root-folder`),
    enabled: Boolean(workspaceId),
  });
}

export function useOrganizationMembers(orgId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["organizations", orgId, "members"],
    queryFn: () =>
      authedFetch<OrganizationMemberResponse[]>(`/organizations/${orgId}/members`),
    enabled: Boolean(orgId),
  });
}

export function useChangeMemberRole(orgId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: PermissionRole }) =>
      authedFetch<OrganizationMemberResponse>(
        `/organizations/${orgId}/members/${userId}`,
        { method: "PATCH", body: JSON.stringify({ role }) },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
    },
  });
}

export function useRemoveOrganizationMember(orgId: string) {
  const authedFetch = useAuthedFetch();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      authedFetch<void>(`/organizations/${orgId}/members/${userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["organizations", orgId, "members"] });
    },
  });
}
