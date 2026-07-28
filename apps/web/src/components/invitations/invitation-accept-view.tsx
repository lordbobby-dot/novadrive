"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import type { PermissionResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api-client";
import { useAuthedFetch } from "@/hooks/use-authed-fetch";

type ViewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "accepted"; permission: PermissionResponse };

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center">
        {children}
      </div>
    </main>
  );
}

export function InvitationAcceptView({ token }: { token: string }) {
  const authedFetch = useAuthedFetch();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    authedFetch<PermissionResponse>(`/invitations/${token}/accept`, { method: "POST" })
      .then((permission) => {
        if (!cancelled) setState({ status: "accepted", permission });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError ? error.message : "Couldn't accept this invitation.";
        setState({ status: "error", message });
      });
    return () => {
      cancelled = true;
    };
    // authedFetch is a fresh function reference every render; only token identifies this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state.status === "loading") {
    return (
      <Shell>
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-32" />
      </Shell>
    );
  }

  if (state.status === "error") {
    return (
      <Shell>
        <XCircle className="size-10 text-destructive" />
        <h1 className="text-lg font-medium">Couldn&apos;t accept this invitation</h1>
        <p className="text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" render={<Link href="/drive" />}>
          Go to My Drive
        </Button>
      </Shell>
    );
  }

  const { permission } = state;
  const driveHref = permission.resourceType === "FOLDER" ? `/drive/${permission.resourceId}` : "/drive";

  return (
    <Shell>
      <CheckCircle2 className="size-10 text-primary" />
      <h1 className="text-lg font-medium">You&apos;re in</h1>
      <p className="text-sm text-muted-foreground">
        You now have <span className="font-medium text-foreground">{roleLabel(permission.role)}</span>{" "}
        access.
      </p>
      <Button render={<Link href={driveHref} />}>Open in Drive</Button>
    </Shell>
  );
}
