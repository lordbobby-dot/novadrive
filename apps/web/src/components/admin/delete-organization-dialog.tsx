"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { useDeleteOrganization } from "@/hooks/use-admin";
import type { AdminOrganizationResponse } from "@novadrive/types";

export function DeleteOrganizationDialog({
  organization,
  onOpenChange,
}: {
  organization: AdminOrganizationResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const deleteOrganization = useDeleteOrganization();
  const [confirmText, setConfirmText] = useState("");

  const isValid = organization !== null && confirmText === organization.name;

  function handleConfirm() {
    if (!organization || !isValid) return;
    deleteOrganization.mutate(organization.id, {
      onSuccess: () => {
        toast.success(`Deleted ${organization.name}`);
        setConfirmText("");
        onOpenChange(false);
        router.push("/admin/organizations");
      },
      onError: () => toast.error(`Failed to delete ${organization.name}`),
    });
  }

  return (
    <Dialog
      open={organization !== null}
      onOpenChange={(open) => {
        if (!open) setConfirmText("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {organization?.name}?</DialogTitle>
          <DialogDescription>
            This permanently deletes the organization and cascades to every workspace, folder, and
            file inside it. This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm-org-name">
            Type <span className="font-medium text-foreground">{organization?.name}</span> to
            confirm
          </Label>
          <Input
            id="confirm-org-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || deleteOrganization.isPending}
          >
            Delete permanently
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
