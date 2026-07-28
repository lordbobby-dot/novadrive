"use client";

import { toast } from "sonner";
import type { CursorPage, FolderResponse } from "@novadrive/types";
import { queryClient } from "@/app/providers";
import { useUploadStore, type UploadItem } from "@/store/upload-store";
import type { DroppedFile } from "./dropped-items";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MAX_CONCURRENT_PARTS = 4;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 120_000;

type TokenGetter = () => Promise<string | null>;

interface InitiateResponse {
  uploadId: string;
  partSize: string;
  totalParts: number;
  parts: { partNumber: number; url: string }[];
}

interface UploadStatusResponse {
  status: string;
}

interface ActiveUpload {
  file: File;
  folderId: string;
  getToken: TokenGetter;
  /** Set when this upload is a new version of an existing file rather than a new file. */
  versionOfFileId?: string;
  serverUploadId?: string;
  partSize?: number;
  totalParts?: number;
  presignedUrls: Map<number, string>;
  completedParts: Set<number>;
  paused: boolean;
  cancelled: boolean;
  running: boolean;
}

const activeUploads = new Map<string, ActiveUpload>();

/** Looks up the clientId (this tab's own store key) for a server uploadId, if this tab is the
 * one that initiated the upload. Used to tell apart events for uploads this tab already tracks
 * (which its own runUpload loop is already reflecting into the store) from events for uploads
 * some other tab initiated (which need a mirrored store entry keyed by the server's uploadId,
 * since this tab never generated a clientId for them). */
export function findClientIdForServerUploadId(serverUploadId: string): string | undefined {
  for (const [clientId, active] of activeUploads) {
    if (active.serverUploadId === serverUploadId) return clientId;
  }
  return undefined;
}

/** True if this tab is actually driving the given upload (as opposed to a store entry mirrored
 * in from another tab's `upload:*` events) — controls whether pause/resume/cancel are offered,
 * since those only have anything to act on in the initiating tab. */
export function isLocallyTracked(id: string): boolean {
  return activeUploads.has(id);
}

/** For JSON API calls only — the raw S3 PUTs in uploadOnePart go through fetch() directly. */
async function authedFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${path} failed with ${response.status}${text ? `: ${text}` : ""}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function updateItem(id: string, patch: Partial<UploadItem>): void {
  const previousStatus = useUploadStore.getState().items[id]?.status;
  useUploadStore.getState().update(id, patch);

  if (patch.status && patch.status !== previousStatus) {
    const item = useUploadStore.getState().items[id];
    const name = item?.name ?? "File";
    if (patch.status === "completed") {
      toast.success(item?.versionOfFileId ? `New version of ${name} uploaded` : `${name} uploaded`);
      if (item?.versionOfFileId) {
        void queryClient.invalidateQueries({ queryKey: ["files", item.versionOfFileId, "versions"] });
      } else if (item) {
        void queryClient.invalidateQueries({ queryKey: ["files", "byFolder", item.folderId] });
      }
    } else if (patch.status === "failed") {
      toast.error(`${name} failed to upload`, { description: patch.error });
    } else if (patch.status === "quarantined") {
      toast.error(`${name} was blocked by the virus scan`, { description: patch.error });
    }
  }
}

interface RemoteUploadStartedPayload {
  uploadId: string;
  name: string;
  folderId: string;
  size: string;
}
interface RemoteUploadProgressPayload {
  uploadId: string;
  completedParts: number;
  totalParts: number | null;
}
interface RemoteUploadCompletedPayload {
  uploadId: string;
  fileId: string;
  name?: string;
  versionOfFileId?: string;
}
interface RemoteUploadFailedPayload {
  uploadId: string;
  reason: string;
}
interface RemoteUploadQuarantinedPayload {
  uploadId: string;
  viruses: string[];
}
interface RemoteUploadAbortedPayload {
  uploadId: string;
}

/** Cross-tab sync for the ephemeral `upload:*` socket events (see RealtimeEmitter on the API side)
 * — a tab that didn't initiate the upload has no clientId for it, so these mirror server state
 * into the store keyed by the server's own uploadId instead. A tab that DID initiate the upload
 * already reflects every one of these transitions into the store itself via its own runUpload
 * loop, so events for a locally-tracked uploadId are ignored here to avoid double-applying (and,
 * for `started`, avoid creating a duplicate second entry next to the client-keyed one). */
export function applyRemoteUploadEvent(event: string, payload: unknown): void {
  switch (event) {
    case "upload:started": {
      const p = payload as RemoteUploadStartedPayload;
      if (findClientIdForServerUploadId(p.uploadId)) return;
      useUploadStore.getState().upsert({
        id: p.uploadId,
        name: p.name,
        folderId: p.folderId,
        size: Number(p.size),
        status: "uploading",
        progress: 0,
      });
      return;
    }
    case "upload:progress": {
      const p = payload as RemoteUploadProgressPayload;
      if (findClientIdForServerUploadId(p.uploadId)) return;
      const totalParts = p.totalParts ?? 1;
      updateItem(p.uploadId, { progress: Math.round((p.completedParts / totalParts) * 100) });
      return;
    }
    case "upload:completed": {
      const p = payload as RemoteUploadCompletedPayload;
      if (findClientIdForServerUploadId(p.uploadId)) return;
      updateItem(p.uploadId, { status: "completed", progress: 100 });
      return;
    }
    case "upload:failed": {
      const p = payload as RemoteUploadFailedPayload;
      if (findClientIdForServerUploadId(p.uploadId)) return;
      updateItem(p.uploadId, { status: "failed", error: p.reason });
      return;
    }
    case "upload:aborted": {
      const p = payload as RemoteUploadAbortedPayload;
      if (findClientIdForServerUploadId(p.uploadId)) return;
      updateItem(p.uploadId, { status: "cancelled" });
      return;
    }
    case "upload:quarantined": {
      const p = payload as RemoteUploadQuarantinedPayload;
      if (findClientIdForServerUploadId(p.uploadId)) return;
      updateItem(p.uploadId, {
        status: "quarantined",
        error: p.viruses.join(", "),
      });
      return;
    }
  }
}

export function enqueueUpload(
  clientId: string,
  file: File,
  folderId: string,
  getToken: TokenGetter,
  versionOfFileId?: string,
): void {
  useUploadStore.getState().upsert({
    id: clientId,
    name: file.name,
    folderId,
    size: file.size,
    status: "queued",
    progress: 0,
    versionOfFileId,
  });

  activeUploads.set(clientId, {
    file,
    folderId,
    versionOfFileId,
    getToken,
    presignedUrls: new Map(),
    completedParts: new Set(),
    paused: false,
    cancelled: false,
    running: false,
  });

  void runUpload(clientId);
}

/** Uploads new bytes through the exact same chunked pipeline as a regular upload, but completes
 * it as a new version of `fileId` instead of a new file — reuses all of the retry/resume/progress
 * machinery in runUpload rather than duplicating it. `folderId` is only needed for the initiate
 * step's folder-ownership check; the file being versioned already lives there. */
export function enqueueVersionUpload(
  clientId: string,
  file: File,
  fileId: string,
  folderId: string,
  getToken: TokenGetter,
): void {
  enqueueUpload(clientId, file, folderId, getToken, fileId);
}

async function findChildFolderByName(
  parentId: string,
  name: string,
  token: string,
): Promise<FolderResponse | undefined> {
  let cursor: string | null = null;
  for (;;) {
    const query: string = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : "?limit=100";
    const page: CursorPage<FolderResponse> = await authedFetch(`/folders/${parentId}/children${query}`, token);
    const match: FolderResponse | undefined = page.items.find(
      (folder: FolderResponse) => folder.name === name,
    );
    if (match) return match;
    if (!page.nextCursor) return undefined;
    cursor = page.nextCursor;
  }
}

async function getOrCreateFolder(parentId: string, name: string, token: string): Promise<string> {
  const existing = await findChildFolderByName(parentId, name, token);
  if (existing) return existing.id;
  const created = await authedFetch<FolderResponse>("/folders", token, {
    method: "POST",
    body: JSON.stringify({ name, parentId }),
  });
  void queryClient.invalidateQueries({ queryKey: ["folders", parentId, "children"] });
  return created.id;
}

/** Recreates the directory structure of a drag-and-dropped folder under `targetFolderId`
 * (reusing existing subfolders by name rather than duplicating them), then enqueues each
 * file into its resolved destination folder. */
export async function enqueueFilesWithFolders(
  items: DroppedFile[],
  targetFolderId: string,
  getToken: TokenGetter,
): Promise<void> {
  const initialToken = await getToken();
  if (!initialToken) throw new Error("Not authenticated");
  const token: string = initialToken;

  const folderIdByPath = new Map<string, string>([["", targetFolderId]]);

  async function resolvePath(segments: string[]): Promise<string> {
    const key = segments.join("/");
    const cached = folderIdByPath.get(key);
    if (cached) return cached;

    const parentId = await resolvePath(segments.slice(0, -1));
    const name = segments[segments.length - 1];
    if (!name) throw new Error("Invalid folder path segment");
    const folderId = await getOrCreateFolder(parentId, name, token);
    folderIdByPath.set(key, folderId);
    return folderId;
  }

  for (const item of items) {
    const folderId = await resolvePath(item.relativePath);
    enqueueUpload(crypto.randomUUID(), item.file, folderId, getToken);
  }
}

export function pauseUpload(clientId: string): void {
  const active = activeUploads.get(clientId);
  if (!active) return;
  active.paused = true;
  updateItem(clientId, { status: "paused" });
}

export function resumeUpload(clientId: string): void {
  const active = activeUploads.get(clientId);
  if (!active || active.running) return;
  active.paused = false;
  updateItem(clientId, { status: "uploading" });
  void runUpload(clientId);
}

export async function cancelUpload(clientId: string): Promise<void> {
  const active = activeUploads.get(clientId);
  if (!active) return;
  active.cancelled = true;
  updateItem(clientId, { status: "cancelled" });

  if (active.serverUploadId) {
    const token = await active.getToken();
    if (token) {
      await authedFetch(`/uploads/${active.serverUploadId}/abort`, token, { method: "POST" }).catch(() => {
        // Best-effort — the upload is already marked cancelled client-side either way.
      });
    }
  }
  activeUploads.delete(clientId);
}

async function runUpload(clientId: string): Promise<void> {
  const active = activeUploads.get(clientId);
  if (!active || active.running || active.paused || active.cancelled) return;
  active.running = true;

  try {
    updateItem(clientId, { status: "uploading" });
    const token = await active.getToken();
    if (!token) throw new Error("Not authenticated");

    if (!active.serverUploadId) {
      const checksum = await computeSha256(active.file);
      if (active.cancelled) return;

      const initiate = await authedFetch<InitiateResponse>("/uploads/initiate", token, {
        method: "POST",
        body: JSON.stringify({
          name: active.file.name,
          folderId: active.folderId,
          contentType: active.file.type || "application/octet-stream",
          size: active.file.size.toString(),
          checksum,
        }),
      });
      active.serverUploadId = initiate.uploadId;
      active.partSize = Number(initiate.partSize);
      active.totalParts = initiate.totalParts;
      for (const part of initiate.parts) {
        active.presignedUrls.set(part.partNumber, part.url);
      }
    }

    const totalParts = active.totalParts ?? 1;
    const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter(
      (partNumber) => !active.completedParts.has(partNumber),
    );

    await runWithConcurrency(remaining, MAX_CONCURRENT_PARTS, async (partNumber) => {
      if (active.paused || active.cancelled) return;
      await withRetry(active, () => uploadOnePart(active, partNumber, token));
      const progress = Math.round((active.completedParts.size / totalParts) * 100);
      updateItem(clientId, { progress });
    });

    if (active.cancelled) return;
    if (active.paused) {
      active.running = false;
      return;
    }
    if (active.completedParts.size < totalParts) {
      // Concurrency pool stopped early for a reason other than pause/cancel — surface it.
      throw new Error("Upload did not complete all parts");
    }

    updateItem(clientId, { status: "completing" });
    await authedFetch(`/uploads/${active.serverUploadId}/complete`, token, {
      method: "POST",
      body: JSON.stringify(
        active.versionOfFileId
          ? { versionOfFileId: active.versionOfFileId }
          : { folderId: active.folderId, name: active.file.name },
      ),
    });

    const finalStatus = await pollUntilTerminal(active.serverUploadId!, token);
    if (finalStatus === "COMPLETED") {
      updateItem(clientId, { status: "completed", progress: 100 });
    } else if (finalStatus === "QUARANTINED") {
      updateItem(clientId, {
        status: "quarantined",
        error: "The virus scan flagged this file — it was not uploaded.",
      });
    } else {
      updateItem(clientId, {
        status: "failed",
        error: "Checksum verification failed — the file may be corrupted.",
      });
    }
    activeUploads.delete(clientId);
  } catch (error) {
    updateItem(clientId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Upload failed",
    });
  } finally {
    active.running = false;
  }
}

async function uploadOnePart(active: ActiveUpload, partNumber: number, token: string): Promise<void> {
  let url = active.presignedUrls.get(partNumber);
  if (!url) {
    const presigned = await authedFetch<{ partNumber: number; url: string }[]>(
      `/uploads/${active.serverUploadId}/presign-parts`,
      token,
      { method: "POST", body: JSON.stringify({ partNumbers: [partNumber] }) },
    );
    url = presigned[0]?.url;
    if (!url) throw new Error(`Failed to get an upload URL for part ${partNumber}`);
  }

  const partSize = active.partSize ?? active.file.size;
  const start = (partNumber - 1) * partSize;
  const chunk = active.file.slice(start, start + partSize);

  const response = await fetch(url, { method: "PUT", body: chunk });
  if (!response.ok) {
    throw new Error(`Part ${partNumber} upload failed with status ${response.status}`);
  }
  const eTag = response.headers.get("etag");
  if (!eTag) {
    throw new Error(`S3 did not return an ETag for part ${partNumber}`);
  }

  await authedFetch(`/uploads/${active.serverUploadId}/parts`, token, {
    method: "POST",
    body: JSON.stringify({ partNumber, eTag, size: chunk.size.toString() }),
  });
  active.completedParts.add(partNumber);
}

const PART_RETRY_ATTEMPTS = 3;
const PART_RETRY_BASE_DELAY_MS = 500;

/** Retries a flaky operation (a single part's S3 PUT + report-part call) with exponential
 * backoff, so a transient network blip mid-upload doesn't fail the whole file. Bails out early,
 * without consuming a retry, if the user paused/cancelled during the backoff wait. */
async function withRetry(active: ActiveUpload, fn: () => Promise<void>): Promise<void> {
  let attempt = 0;
  for (;;) {
    try {
      await fn();
      return;
    } catch (error) {
      attempt++;
      if (attempt > PART_RETRY_ATTEMPTS || active.paused || active.cancelled) throw error;
      const delay = PART_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

async function pollUntilTerminal(uploadId: string, token: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await authedFetch<UploadStatusResponse>(`/uploads/${uploadId}`, token);
    if (status.status === "COMPLETED" || status.status === "FAILED" || status.status === "QUARANTINED") {
      return status.status;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for upload verification");
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function next(): Promise<void> {
    const current = index++;
    if (current >= items.length) return;
    await worker(items[current]);
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => next()));
}
