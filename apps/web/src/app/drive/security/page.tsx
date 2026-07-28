"use client";

import { useClerk } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuditLogList } from "@/components/security/audit-log-list";

export default function SecurityPage() {
  const { openUserProfile } = useClerk();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <h1 className="text-lg font-semibold">Security</h1>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Two-factor authentication, passkeys & sessions</p>
            <p className="text-sm text-muted-foreground">
              Enroll in 2FA, manage passkeys, and review or revoke active sessions/devices —
              handled by Clerk, your account provider.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => openUserProfile()} className="shrink-0">
          Manage account security
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Security activity</h2>
          <p className="text-sm text-muted-foreground">
            Sign-ins, permission changes, and blocked attempts on your NovaDrive account.
          </p>
        </div>
        <AuditLogList filters={{ limit: 30 }} />
      </div>
    </div>
  );
}
