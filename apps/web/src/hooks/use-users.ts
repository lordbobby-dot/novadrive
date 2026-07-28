"use client";

import { useQuery } from "@tanstack/react-query";
import type { UserResponse } from "@novadrive/types";
import { useAuthedFetch } from "./use-authed-fetch";

/** Used to decide whether to show admin-only UI (the sidebar "Admin" link, the /admin route
 * guard) — never trusted as the actual authorization boundary, which is enforced server-side by
 * AdminGuard on every /admin/* request regardless of what this renders. */
export function useCurrentUser() {
  const authedFetch = useAuthedFetch();
  return useQuery({
    queryKey: ["users", "me"],
    queryFn: () => authedFetch<UserResponse>("/users/me"),
    staleTime: 60_000,
  });
}
