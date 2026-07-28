"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/use-users";
import { Skeleton } from "@/components/ui/skeleton";

/** Client-side only — purely a UX nicety that keeps a non-admin from staring at a half-rendered
 * admin page before being sent back. The real authorization boundary is AdminGuard on the API,
 * which 403s every /admin/* request regardless of what this component does. */
export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading, isError } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (isError || !user?.isSystemAdmin)) {
      router.replace("/drive");
    }
  }, [isLoading, isError, user, router]);

  if (isLoading || isError || !user?.isSystemAdmin) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return <>{children}</>;
}
