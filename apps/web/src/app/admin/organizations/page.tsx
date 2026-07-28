"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdminOrganizationResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminOrganizations } from "@/hooks/use-admin";
import { formatBytes } from "@/lib/format-bytes";

export default function AdminOrganizationsPage() {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<AdminOrganizationResponse[]>([]);

  const { data, isLoading, isFetching } = useAdminOrganizations({
    search: search || undefined,
    cursor,
    limit: 20,
  });

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

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Organizations</h1>
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search by name…"
          className="max-w-xs"
        />
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">No organizations found.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((org) => (
            <li key={org.id}>
              <Link
                href={`/admin/organizations/${org.id}`}
                className="flex items-center gap-4 rounded-md border border-border px-3 py-3 transition-colors hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium">{org.name}</span>
                  <div className="mt-0.5 flex gap-4 text-xs text-muted-foreground">
                    <span>
                      {org.memberCount} member{org.memberCount === 1 ? "" : "s"}
                    </span>
                    <span>
                      {org.workspaceCount} workspace{org.workspaceCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <div>
                    {formatBytes(org.storageUsedBytes)}
                    {org.storageLimitBytes ? ` / ${formatBytes(org.storageLimitBytes)}` : ""}
                  </div>
                  <div>Created {new Date(org.createdAt).toLocaleDateString()}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data?.nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
