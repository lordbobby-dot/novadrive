"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CommentResponse, ResourceType } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

export function useComments(resourceType: ResourceType, resourceId: string | undefined) {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["comments", resourceType, resourceId],
    queryFn: () =>
      authedFetch<CommentResponse[]>(
        `/resources/${resourceType.toLowerCase()}/${resourceId}/comments`,
      ),
    enabled: Boolean(resourceId),
  });
}

function useInvalidateComments(resourceType: ResourceType, resourceId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["comments", resourceType, resourceId] });
  };
}

export function useCreateComment(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateComments(resourceType, resourceId);
  return useMutation({
    mutationFn: (body: string) =>
      authedFetch<CommentResponse>("/comments", {
        method: "POST",
        body: JSON.stringify({ resourceType, resourceId, body }),
      }),
    onSuccess: invalidate,
  });
}

export function useResolveComment(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateComments(resourceType, resourceId);
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      authedFetch<CommentResponse>(`/comments/${id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: invalidate,
  });
}

export function useDeleteComment(resourceType: ResourceType, resourceId: string) {
  const authedFetch = useAuthedFetch();
  const invalidate = useInvalidateComments(resourceType, resourceId);
  return useMutation({
    mutationFn: (id: string) => authedFetch<void>(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });
}
