"use client";

import { useState } from "react";
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
import { useTransferOrganizationOwnership } from "@/hooks/use-admin";
import type { AdminOrganizationMemberResponse, AdminOrganizationResponse } from "@novadrive/types";

export function TransferOwnershipDialog({
  organization,
  members,
  onOpenChange,
}: {
  organization: AdminOrganizationResponse | null;
  members: AdminOrganizationMemberResponse[];
  onOpenChange: (open: boolean) => void;
}) {
  const transferOwnership = useTransferOrganizationOwnership(organization?.id ?? "");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [manualUserId, setManualUserId] = useState("");

  const nonOwnerMembers = members.filter((m) => m.role !== "OWNER");
  const targetUserId = manualUserId.trim() || selectedUserId;
  const isValid = targetUserId !== "" && targetUserId !== organization?.ownerId;

  function reset() {
    setSelectedUserId("");
    setManualUserId("");
  }

  function handleConfirm() {
    if (!organization || !isValid) return;
    transferOwnership.mutate(targetUserId, {
      onSuccess: () => {
        toast.success(`Transferred ownership of ${organization.name}`);
        reset();
        onOpenChange(false);
      },
      onError: () => toast.error(`Failed to transfer ownership of ${organization.name}`),
    });
  }

  return (
    <Dialog
      open={organization !== null}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Transfer ownership of {organization?.name}</DialogTitle>
          <DialogDescription>
            The current owner is downgraded to an ADMIN member rather than losing access. The new
            owner doesn&apos;t need to already be a member.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {nonOwnerMembers.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="transfer-member-select">Existing member</Label>
              <select
                id="transfer-member-select"
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setManualUserId("");
                }}
                className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Select a member…</option>
                {nonOwnerMembers.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name ?? m.email ?? m.userId} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="transfer-user-id">Or enter a user ID directly</Label>
            <Input
              id="transfer-user-id"
              value={manualUserId}
              onChange={(e) => {
                setManualUserId(e.target.value);
                setSelectedUserId("");
              }}
              placeholder="Any existing user ID"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!isValid || transferOwnership.isPending}>
            Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
