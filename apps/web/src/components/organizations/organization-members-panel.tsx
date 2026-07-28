"use client";

import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { OrganizationMemberResponse, PermissionRole } from "@novadrive/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useChangeMemberRole,
  useOrganizationMembers,
  useRemoveOrganizationMember,
} from "@/hooks/use-organizations";
import { useCreateInvitation, useInvitations, useRevokeInvitation } from "@/hooks/use-sharing";

const ASSIGNABLE_ROLES: PermissionRole[] = ["ADMIN", "EDITOR", "VIEWER", "GUEST"];

function initialOf(member: OrganizationMemberResponse): string {
  return (member.name ?? member.email ?? "?").charAt(0).toUpperCase();
}

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function OrganizationMembersPanel({
  organizationId,
  canManage,
}: {
  organizationId: string;
  /** Invite/role-change/remove all require ADMIN+ server-side (see ChangeMemberRoleUseCase /
   * RemoveOrganizationMemberUseCase) — hidden here too so a VIEWER/EDITOR doesn't see controls
   * that would just 403. */
  canManage: boolean;
}) {
  const { data: members, isLoading: loadingMembers } = useOrganizationMembers(organizationId);
  // Listing invitations requires ADMIN+ server-side (see ListInvitationsForResourceUseCase) —
  // only fetched when the caller can actually manage members, to avoid a guaranteed 403.
  const { data: invitations, isLoading: loadingInvitations } = useInvitations(
    "ORGANIZATION",
    canManage ? organizationId : undefined,
  );
  const createInvitation = useCreateInvitation("ORGANIZATION", organizationId);
  const revokeInvitation = useRevokeInvitation("ORGANIZATION", organizationId);
  const changeRole = useChangeMemberRole(organizationId);
  const removeMember = useRemoveOrganizationMember(organizationId);

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

  async function handleRevokeInvitation(invitationId: string, invitedEmail: string) {
    try {
      await revokeInvitation.mutateAsync(invitationId);
      toast.success(`Revoked invitation to ${invitedEmail}`);
    } catch {
      toast.error("Couldn't revoke invitation");
    }
  }

  async function handleRemove(member: OrganizationMemberResponse) {
    try {
      await removeMember.mutateAsync(member.userId);
      toast.success(`Removed ${member.email ?? "member"}`);
    } catch {
      toast.error("Couldn't remove member");
    }
  }

  const isLoading = loadingMembers || loadingInvitations;

  return (
    <div className="flex flex-col gap-3">
      {canManage && (
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
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as PermissionRole)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
          <Button onClick={() => void handleInvite()} disabled={createInvitation.isPending}>
            Invite
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {members?.map((member) => {
            const isOwner = member.role === "OWNER";
            return (
              <li
                key={member.id}
                className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
                  {initialOf(member)}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {member.name ?? member.email ?? member.userId}
                </span>
                {isOwner || !canManage ? (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                    {roleLabel(member.role)}
                  </span>
                ) : (
                  <select
                    value={member.role}
                    disabled={changeRole.isPending}
                    onChange={(e) =>
                      changeRole.mutate(
                        { userId: member.userId, role: e.target.value as PermissionRole },
                        {
                          onSuccess: () => toast.success("Role updated"),
                          onError: () => toast.error("Couldn't update role"),
                        },
                      )
                    }
                    className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </select>
                )}
                {!isOwner && canManage && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${member.email ?? "member"}`}
                    onClick={() => void handleRemove(member)}
                    disabled={removeMember.isPending}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </li>
            );
          })}
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
                Invited · {roleLabel(invite.role)}
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
