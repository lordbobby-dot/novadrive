"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { AdminUserResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format-bytes";
import { useCurrentUser } from "@/hooks/use-users";
import {
  useAdminUsers,
  useSetSystemAdmin,
  useUnsuspendUser,
} from "@/hooks/use-admin";
import { SuspendUserDialog } from "@/components/admin/suspend-user-dialog";
import { SetQuotaDialog } from "@/components/admin/set-quota-dialog";

export default function AdminUsersPage() {
  const { data: me } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<AdminUserResponse[]>([]);
  const [suspendTarget, setSuspendTarget] = useState<AdminUserResponse | null>(null);
  const [quotaTarget, setQuotaTarget] = useState<AdminUserResponse | null>(null);

  const { data, isLoading, isFetching } = useAdminUsers({ search: search || undefined, cursor, limit: 20 });
  const unsuspendUser = useUnsuspendUser();
  const setSystemAdmin = useSetSystemAdmin();

  const items = cursor ? [...accumulated, ...(data?.items ?? [])] : (data?.items ?? []);

  function handleSearchChange(value: string) {
    setSearch(value);
    setAccumulated([]);
    setCursor(undefined);
  }

  function loadMore() {
    if (!data?.nextCursor) return;
    setAccumulated(items);
    setCursor(data.nextCursor);
  }

  function handleUnsuspend(user: AdminUserResponse) {
    unsuspendUser.mutate(user.id, {
      onSuccess: () => toast.success(`Unsuspended ${user.email}`),
      onError: () => toast.error(`Failed to unsuspend ${user.email}`),
    });
  }

  function handleToggleAdmin(user: AdminUserResponse) {
    setSystemAdmin.mutate(
      { userId: user.id, isSystemAdmin: !user.isSystemAdmin },
      {
        onSuccess: () =>
          toast.success(
            user.isSystemAdmin
              ? `Revoked admin role from ${user.email}`
              : `Granted admin role to ${user.email}`,
          ),
        onError: () => toast.error(`Failed to update ${user.email}'s role`),
      },
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Users</h1>
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by email or name…"
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No users found.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((user) => {
            const isSelf = user.id === me?.id;
            return (
              <li
                key={user.id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {(user.name ?? user.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {user.name ?? user.email}
                    </span>
                    {user.isSystemAdmin && (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        Admin
                      </span>
                    )}
                    {user.isSuspended && (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                        Suspended
                      </span>
                    )}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                </div>

                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {formatBytes(user.storageUsedBytes ?? "0")} /{" "}
                  {user.storageLimitBytes ? formatBytes(user.storageLimitBytes) : "default"}
                </span>

                <Button variant="outline" size="sm" onClick={() => setQuotaTarget(user)}>
                  Set quota
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSelf || setSystemAdmin.isPending}
                  title={isSelf ? "You can't revoke your own admin role" : undefined}
                  onClick={() => handleToggleAdmin(user)}
                >
                  {user.isSystemAdmin ? "Revoke admin" : "Make admin"}
                </Button>

                {user.isSuspended ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={unsuspendUser.isPending}
                    onClick={() => handleUnsuspend(user)}
                  >
                    Unsuspend
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={isSelf}
                    title={isSelf ? "You can't suspend your own account" : undefined}
                    onClick={() => setSuspendTarget(user)}
                  >
                    Suspend
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data?.nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}

      <SuspendUserDialog user={suspendTarget} onOpenChange={(open) => !open && setSuspendTarget(null)} />
      <SetQuotaDialog user={quotaTarget} onOpenChange={(open) => !open && setQuotaTarget(null)} />
    </div>
  );
}
