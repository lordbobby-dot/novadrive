"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetUserQuota } from "@/hooks/use-admin";
import { formatBytes } from "@/lib/format-bytes";
import type { AdminUserResponse } from "@novadrive/types";

const BYTES_PER_GB = 1024 ** 3;

export function SetQuotaDialog({
  user,
  onOpenChange,
}: {
  user: AdminUserResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  const setUserQuota = useSetUserQuota();
  const [gigabytes, setGigabytes] = useState("");

  // Re-seed the input with this user's current limit (or blank, for "no override yet") every
  // time a different user is opened — otherwise the previous user's typed value would linger.
  useEffect(() => {
    if (!user) return;
    setGigabytes(
      user.storageLimitBytes
        ? String(Number(user.storageLimitBytes) / BYTES_PER_GB)
        : "",
    );
  }, [user]);

  const parsedGb = Number(gigabytes);
  const isValid = gigabytes.trim() !== "" && Number.isFinite(parsedGb) && parsedGb > 0;

  function handleConfirm() {
    if (!user || !isValid) return;
    const limitBytes = String(Math.round(parsedGb * BYTES_PER_GB));
    setUserQuota.mutate(
      { userId: user.id, limitBytes },
      {
        onSuccess: () => {
          toast.success(`Set ${user.email}'s storage limit to ${formatBytes(limitBytes)}`);
          onOpenChange(false);
        },
        onError: () => toast.error(`Failed to update ${user.email}'s storage quota`),
      },
    );
  }

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set storage quota for {user?.email}</DialogTitle>
          <DialogDescription>
            {user?.storageLimitBytes
              ? `Currently ${formatBytes(user.storageLimitBytes)}, ${formatBytes(user.storageUsedBytes ?? "0")} used.`
              : "No override yet — the platform default applies until you set one."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quota-gb">Storage limit (GB)</Label>
          <Input
            id="quota-gb"
            type="number"
            min="0"
            step="0.1"
            value={gigabytes}
            onChange={(e) => setGigabytes(e.target.value)}
            placeholder="e.g. 25"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || setUserQuota.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
