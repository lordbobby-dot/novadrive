"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, File as FileIcon, Folder as FolderIcon, Lock } from "lucide-react";
import type { SharedLinkAccessResponse } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";
import { triggerBrowserDownload } from "@/lib/download-file";
import { SharedFolderBrowser } from "./shared-folder-browser";

interface SharedLinkDownload {
  url: string;
  expiresAt: string;
  fileName: string;
}

function formatBytes(size: string): string {
  const bytes = Number(size);
  if (!Number.isFinite(bytes)) return `${size} B`;
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

type ViewState =
  | { status: "loading" }
  | { status: "password-required"; wrongPassword: boolean }
  | { status: "not-found" }
  | { status: "ready"; access: SharedLinkAccessResponse };

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <div
        className={
          wide
            ? "flex w-full max-w-xl flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center"
            : "flex w-full max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 text-center"
        }
      >
        {children}
      </div>
    </main>
  );
}

export function ShareLinkView({ token }: { token: string }) {
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [password, setPassword] = useState("");
  const [downloading, setDownloading] = useState(false);

  async function load(withPassword?: string) {
    try {
      const access = await apiFetch<SharedLinkAccessResponse>(
        `/shared-links/${token}${withPassword ? `?password=${encodeURIComponent(withPassword)}` : ""}`,
      );
      setState({ status: "ready", access });
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setState({ status: "password-required", wrongPassword: Boolean(withPassword) });
        return;
      }
      setState({ status: "not-found" });
    }
  }

  useEffect(() => {
    void load();
    // `load` is redefined every render but only ever needs to run once per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handlePasswordSubmit() {
    await load(password);
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const result = await apiFetch<SharedLinkDownload>(`/shared-links/${token}/download`, {
        method: "POST",
        body: JSON.stringify({ password: password || undefined }),
      });
      triggerBrowserDownload(result.url, result.fileName);
    } catch {
      toast.error("Couldn't download — the link may have reached its download limit.");
    } finally {
      setDownloading(false);
    }
  }

  if (state.status === "loading") {
    return (
      <Shell>
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-28" />
      </Shell>
    );
  }

  if (state.status === "not-found") {
    return (
      <Shell>
        <h1 className="text-lg font-medium">This link doesn&apos;t work</h1>
        <p className="text-sm text-muted-foreground">
          It may have expired, been revoked, or never existed.
        </p>
      </Shell>
    );
  }

  if (state.status === "password-required") {
    return (
      <Shell>
        <Lock className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-medium">Password required</h1>
        <p className="text-sm text-muted-foreground">This link is password-protected.</p>
        <div className="flex w-full flex-col gap-2">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handlePasswordSubmit();
            }}
            placeholder="Password"
            aria-invalid={state.wrongPassword}
            autoFocus
          />
          {state.wrongPassword && (
            <p className="text-xs text-destructive">That password isn&apos;t correct.</p>
          )}
          <Button onClick={() => void handlePasswordSubmit()}>Unlock</Button>
        </div>
      </Shell>
    );
  }

  const { access } = state;
  const isFolder = access.resourceType === "FOLDER";
  const Icon = isFolder ? FolderIcon : FileIcon;

  if (isFolder) {
    return (
      <Shell wide>
        <Icon className="size-10 text-muted-foreground" />
        <h1 className="truncate text-lg font-medium">{access.resourceName}</h1>
        {!access.canView ? (
          <p className="text-sm text-muted-foreground">This link is not viewable.</p>
        ) : (
          <SharedFolderBrowser token={token} password={password} canDownload={access.canDownload} />
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <Icon className="size-12 text-muted-foreground" />
      <h1 className="truncate text-lg font-medium">{access.resourceName}</h1>
      {access.size !== null && (
        <p className="text-sm text-muted-foreground">
          {access.contentType} · {formatBytes(access.size)}
        </p>
      )}

      {access.canDownload ? (
        <Button onClick={() => void handleDownload()} disabled={downloading}>
          <Download className="size-4" />
          {downloading ? "Preparing…" : "Download"}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">This link is view-only.</p>
      )}
    </Shell>
  );
}
