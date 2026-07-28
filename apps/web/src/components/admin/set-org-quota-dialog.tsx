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
import { useSetOrganizationQuota } from "@/hooks/use-admin";
import { formatBytes } from "@/lib/format-bytes";
import type { AdminOrganizationResponse } from "@novadrive/types";

const BYTES_PER_GB = 1024 ** 3;

export function SetOrgQuotaDialog({
  organization,
  onOpenChange,
}: {
  organization: AdminOrganizationResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  const setOrgQuota = useSetOrganizationQuota(organization?.id ?? "");
  const [gigabytes, setGigabytes] = useState("");

  useEffect(() => {
    if (!organization) return;
    setGigabytes(
      organization.storageLimitBytes
        ? String(Number(organization.storageLimitBytes) / BYTES_PER_GB)
        : "",
    );
  }, [organization]);

  const parsedGb = Number(gigabytes);
  const isValid = gigabytes.trim() !== "" && Number.isFinite(parsedGb) && parsedGb > 0;

  function handleConfirm() {
    if (!organization || !isValid) return;
    const limitBytes = String(Math.round(parsedGb * BYTES_PER_GB));
    setOrgQuota.mutate(limitBytes, {
      onSuccess: () => {
        toast.success(`Set ${organization.name}'s storage limit to ${formatBytes(limitBytes)}`);
        onOpenChange(false);
      },
      onError: () => toast.error(`Failed to update ${organization.name}'s storage quota`),
    });
  }

  return (
    <Dialog open={organization !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set storage quota for {organization?.name}</DialogTitle>
          <DialogDescription>
            {organization?.storageLimitBytes
              ? `Currently ${formatBytes(organization.storageLimitBytes)}, ${formatBytes(organization.storageUsedBytes)} used.`
              : "No override yet — the platform default applies until you set one."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-quota-gb">Storage limit (GB)</Label>
          <Input
            id="org-quota-gb"
            type="number"
            min="0"
            step="0.1"
            value={gigabytes}
            onChange={(e) => setGigabytes(e.target.value)}
            placeholder="e.g. 100"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || setOrgQuota.isPending}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
