"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { SearchResultItemResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSearch } from "@/hooks/use-search";
import { useTags } from "@/hooks/use-tags";
import { useOrganizations, useOrganizationMembers, useWorkspaces } from "@/hooks/use-organizations";
import { ResultList } from "@/components/search/result-list";

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function SearchResults() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const q = searchParams.get("q") ?? "";
  // A folder scope arrives as a query param (e.g. from a "Search in this folder" action) rather
  // than through a picker — there's no folder-browser UI here, just a removable chip.
  const folderId = searchParams.get("folderId") ?? undefined;
  const folderName = searchParams.get("folderName") ?? undefined;

  const [type, setType] = useState<"file" | "folder" | "">("");
  const [tag, setTag] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [orgId, setOrgId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [owner, setOwner] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [accumulated, setAccumulated] = useState<SearchResultItemResponse[]>([]);

  const { data: tags } = useTags();
  const { data: organizations } = useOrganizations();
  const { data: workspaces } = useWorkspaces(orgId || undefined);
  const { data: members } = useOrganizationMembers(orgId || undefined);

  const { data, isLoading, isFetching } = useSearch({
    q,
    type: type || undefined,
    tag: tag || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    workspaceId: workspaceId || undefined,
    owner: workspaceId ? owner || undefined : undefined,
    folderId,
    cursor,
    limit: 20,
  });

  const items = cursor ? [...accumulated, ...(data?.items ?? [])] : (data?.items ?? []);

  function reset() {
    setAccumulated([]);
    setCursor(undefined);
  }

  function loadMore() {
    if (!data?.nextCursor) return;
    setAccumulated(items);
    setCursor(data.nextCursor);
  }

  function clearFolderScope() {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("folderId");
    next.delete("folderName");
    router.replace(`/drive/search?${next.toString()}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-lg font-semibold">
          Search results for &ldquo;{q}&rdquo;
        </h1>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-type">Type</Label>
          <select
            id="filter-type"
            className={selectClass}
            value={type}
            onChange={(e) => {
              reset();
              setType(e.target.value as "file" | "folder" | "");
            }}
          >
            <option value="">All</option>
            <option value="file">Files</option>
            <option value="folder">Folders</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-tag">Tag</Label>
          <select
            id="filter-tag"
            className={selectClass}
            value={tag}
            onChange={(e) => {
              reset();
              setTag(e.target.value);
            }}
          >
            <option value="">Any</option>
            {tags?.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date-from">From</Label>
          <input
            id="filter-date-from"
            type="date"
            className={selectClass}
            value={dateFrom}
            onChange={(e) => {
              reset();
              setDateFrom(e.target.value);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date-to">To</Label>
          <input
            id="filter-date-to"
            type="date"
            className={selectClass}
            value={dateTo}
            onChange={(e) => {
              reset();
              setDateTo(e.target.value);
            }}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-workspace">Workspace</Label>
          <div className="flex gap-1">
            <select
              id="filter-org"
              className={selectClass}
              value={orgId}
              onChange={(e) => {
                reset();
                setOrgId(e.target.value);
                setWorkspaceId("");
                setOwner("");
              }}
            >
              <option value="">My Drive</option>
              {organizations?.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
            {orgId && (
              <select
                id="filter-workspace"
                className={selectClass}
                value={workspaceId}
                onChange={(e) => {
                  reset();
                  setWorkspaceId(e.target.value);
                  setOwner("");
                }}
              >
                <option value="">Select workspace…</option>
                {workspaces?.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {workspaceId && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="filter-owner">Uploaded by</Label>
            <select
              id="filter-owner"
              className={selectClass}
              value={owner}
              onChange={(e) => {
                reset();
                setOwner(e.target.value);
              }}
            >
              <option value="">Anyone</option>
              {members?.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.email ?? m.userId}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {folderId && (
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs">
            In folder: {folderName ?? folderId}
            <button
              type="button"
              onClick={clearFolderScope}
              aria-label="Clear folder scope"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No results for &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <ResultList items={items} />
      )}

      {data?.nextCursor && (
        <Button variant="outline" onClick={loadMore} disabled={isFetching} className="self-center">
          {isFetching ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
