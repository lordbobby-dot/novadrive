"use client";

import { useEffect } from "react";
import { useRealtimeSocket } from "@/lib/realtime-context";
import { applyRemoteUploadEvent } from "@/lib/upload-manager";

const UPLOAD_EVENTS = [
  "upload:started",
  "upload:progress",
  "upload:completed",
  "upload:failed",
  "upload:aborted",
  "upload:quarantined",
] as const;

/** Mirrors other tabs' upload progress into this tab's upload store. Safe to mount once
 * (UploadProgressPanel) — applyRemoteUploadEvent is a no-op for uploads this tab itself
 * initiated. */
export function useUploadRealtimeSync() {
  const socket = useRealtimeSocket();

  useEffect(() => {
    if (!socket) return;

    const listeners = UPLOAD_EVENTS.map((event) => {
      const handler = (payload: unknown) => applyRemoteUploadEvent(event, payload);
      socket.on(event, handler);
      return [event, handler] as const;
    });

    return () => {
      for (const [event, handler] of listeners) {
        socket.off(event, handler);
      }
    };
  }, [socket]);
}
