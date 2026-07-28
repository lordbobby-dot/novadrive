"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Link2, Share2, X } from "lucide-react";
import type { PermissionRole, PermissionResponse, ResourceType } from "@novadrive/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "@/lib/format-date";
import {
  useCreateInvitation,
  useCreateSharedLink,
  useGrantPermission,
  useInvitations,
  usePermissions,
  useRevokeInvitation,
  useRevokePermission,
  useRevokeSharedLink,
  useSharedLinks,
} from "@/hooks/use-sharing";
import type { DriveEntry } from "./drive-item-card";

// OWNER is included here — this is also how an existing collaborator's role gets changed (see
// the RoleSelect usage in the permissions list below), so picking "Owner" there IS the ownership
// transfer affordance. The backend still enforces that only someone who already outranks OWNER
// (i.e. is already the owner, or already holds an OWNER grant) can hand it out — see
// CreateInvitationUseCase/GrantPermissionUseCase's escalation guard — so anyone else attempting
// it just gets the existing "Couldn't update role" error toast, same as any other rejected grant.
const INVITE_ROLES: PermissionRole[] = ["OWNER", "ADMIN", "EDITOR", "VIEWER", "GUEST"];

function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: PermissionRole;
  onChange: (role: PermissionRole) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PermissionRole)}
      className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
    >
      {INVITE_ROLES.map((role) => (
        <option key={role} value={role}>
          {role.charAt(0) + role.slice(1).toLowerCase()}
        </option>
      ))}
    </select>
  );
}

function initialOf(subject: PermissionResponse): string {
  const source = subject.subjectName ?? subject.subjectEmail ?? "?";
  return source.charAt(0).toUpperCase();
}

function PeopleTab({
  resourceType,
  resourceId,
}: {
  resourceType: ResourceType;
  resourceId: string;
}) {
  const { data: permissions, isLoading: loadingPermissions } = usePermissions(
    resourceType,
    resourceId,
  );
  const { data: invitations, isLoading: loadingInvitations } = useInvitations(
    resourceType,
    resourceId,
  );
  const grantPermission = useGrantPermission(resourceType, resourceId);
  const revokePermission = useRevokePermission(resourceType, resourceId);
  const createInvitation = useCreateInvitation(resourceType, resourceId);
  const revokeInvitation = useRevokeInvitation(resourceType, resourceId);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PermissionRole>("EDITOR");

  const pendingInvitations = invitations?.filter((invite) => invite.status === "PENDING") ?? [];

  async function handleInvite() {
    const trimmed = email.trim();
    if (!trimmed) return;
    try {
      await createInvitation.mutateAsync({ email: trimmed, role });
      toast.success(`Invited ${trimmed}`);
      setEmail("");
    } catch {
      toast.error(`Couldn't invite ${trimmed}`);
    }
  }

  async function handleRevokePermission(permission: PermissionResponse) {
    try {
      await revokePermission.mutateAsync(permission.id);
      toast.success(`Removed ${permission.subjectEmail ?? "collaborator"}`);
    } catch {
      toast.error("Couldn't remove access");
    }
  }

  async function handleRevokeInvitation(invitationId: string, invitedEmail: string) {
    try {
      await revokeInvitation.mutateAsync(invitationId);
      toast.success(`Revoked invitation to ${invitedEmail}`);
    } catch {
      toast.error("Couldn't revoke invitation");
    }
  }

  const isLoading = loadingPermissions || loadingInvitations;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleInvite();
            }
          }}
          placeholder="Invite by email"
          type="email"
          className="flex-1"
        />
        <RoleSelect value={role} onChange={setRole} />
        <Button size="sm" onClick={() => void handleInvite()} disabled={createInvitation.isPending}>
          Invite
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (permissions?.length ?? 0) === 0 && pendingInvitations.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Only you have access. Invite someone above.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {permissions?.map((permission) => (
              <li
                key={permission.id}
                className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                  {initialOf(permission)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {permission.subjectName ?? permission.subjectEmail ?? permission.subjectId}
                </span>
                <RoleSelect
                  value={permission.role}
                  disabled={grantPermission.isPending}
                  onChange={(newRole) =>
                    grantPermission.mutate(
                      { subjectId: permission.subjectId, role: newRole },
                      {
                        onSuccess: () => toast.success("Role updated"),
                        onError: () => toast.error("Couldn't update role"),
                      },
                    )
                  }
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${permission.subjectEmail ?? "collaborator"}`}
                  onClick={() => void handleRevokePermission(permission)}
                  disabled={revokePermission.isPending}
                >
                  <X className="size-3.5" />
                </Button>
              </li>
            ))}
          {pendingInvitations.map((invite) => (
            <li
              key={invite.id}
              className="flex items-center gap-2.5 rounded-md border border-dashed px-2.5 py-1.5 text-sm text-muted-foreground"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                {invite.email.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate">{invite.email}</span>
              <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                Invited · {invite.role.charAt(0) + invite.role.slice(1).toLowerCase()}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Revoke invitation to ${invite.email}`}
                onClick={() => void handleRevokeInvitation(invite.id, invite.email)}
                disabled={revokeInvitation.isPending}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkTab({
  resourceType,
  resourceId,
}: {
  resourceType: ResourceType;
  resourceId: string;
}) {
  const { data: links, isLoading } = useSharedLinks(resourceType, resourceId);
  const createLink = useCreateSharedLink(resourceType, resourceId);
  const revokeLink = useRevokeSharedLink(resourceType, resourceId);

  const [password, setPassword] = useState("");
  const [expiresIn, setExpiresIn] = useState<"" | "1" | "7" | "30">("");
  const [maxDownloads, setMaxDownloads] = useState("");

  function shareUrl(token: string): string {
    return `${window.location.origin}/share/${token}`;
  }

  async function handleCopy(token: string) {
    await navigator.clipboard.writeText(shareUrl(token));
    toast.success("Link copied");
  }

  async function handleCreate() {
    try {
      await createLink.mutateAsync({
        password: password.trim() || undefined,
        expiresAt: expiresIn
          ? new Date(Date.now() + Number(expiresIn) * 86_400_000).toISOString()
          : undefined,
        maxDownloads: maxDownloads.trim() ? Number(maxDownloads) : undefined,
      });
      toast.success("Link created");
      setPassword("");
      setExpiresIn("");
      setMaxDownloads("");
    } catch {
      toast.error("Couldn't create link");
    }
  }

  async function handleRevoke(linkId: string) {
    try {
      await revokeLink.mutateAsync(linkId);
      toast.success("Link revoked");
    } catch {
      toast.error("Couldn't revoke link");
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {links?.map((link) => (
        <div key={link.id} className="flex flex-col gap-2 rounded-md border px-2.5 py-2 text-sm">
          <div className="flex items-center gap-2">
            <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
            <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {shareUrl(link.token)}
            </code>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Copy link"
              onClick={() => void handleCopy(link.token)}
            >
              <Copy className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Revoke link"
              onClick={() => void handleRevoke(link.id)}
              disabled={revokeLink.isPending}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {link.hasPassword && <span>Password-protected</span>}
            {link.expiresAt && <span>Expires {formatDistanceToNow(link.expiresAt)}</span>}
            {link.maxDownloads !== null && (
              <span>
                {link.downloadCount}/{link.maxDownloads} downloads used
              </span>
            )}
            {!link.hasPassword && !link.expiresAt && link.maxDownloads === null && (
              <span>No restrictions</span>
            )}
          </div>
        </div>
      ))}

      <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5">
        <p className="text-xs font-medium text-muted-foreground">Create a new link</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (optional)"
            type="text"
            className="flex-1"
          />
          <select
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value as typeof expiresIn)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Never expires</option>
            <option value="1">Expires in 1 day</option>
            <option value="7">Expires in 7 days</option>
            <option value="30">Expires in 30 days</option>
          </select>
          <Input
            value={maxDownloads}
            onChange={(e) => setMaxDownloads(e.target.value.replace(/\D/g, ""))}
            placeholder="Max downloads"
            inputMode="numeric"
            className="w-32"
          />
        </div>
        <Button size="sm" className="self-start" onClick={() => void handleCreate()} disabled={createLink.isPending}>
          Create link
        </Button>
      </div>
    </div>
  );
}

export function ShareDialog({
  entry,
  onOpenChange,
}: {
  entry: DriveEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [tab, setTab] = useState<"people" | "link">("people");
  const resourceType: ResourceType = entry?.type === "folder" ? "FOLDER" : "FILE";

  return (
    <Dialog
      open={entry !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setTab("people");
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate">
            <Share2 className="size-4 shrink-0" />
            Share “{entry?.data.name}”
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setTab("people")}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === "people" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground",
            )}
          >
            People
          </button>
          <button
            type="button"
            onClick={() => setTab("link")}
            className={cn(
              "px-3 py-2 text-sm font-medium",
              tab === "link" ? "border-b-2 border-primary text-foreground" : "text-muted-foreground",
            )}
          >
            Link
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto">
          {entry &&
            (tab === "people" ? (
              <PeopleTab resourceType={resourceType} resourceId={entry.data.id} />
            ) : (
              <LinkTab resourceType={resourceType} resourceId={entry.data.id} />
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
