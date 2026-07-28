export const EMAIL_ADAPTER = Symbol('EMAIL_ADAPTER');

export interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  resourceName: string;
  role: string;
  acceptUrl: string;
}

/** Port for outbound email, mirroring StorageAdapter's shape. Two implementations exist —
 * ConsoleEmailAdapter (logs only, the default) and ResendEmailAdapter (real delivery via the
 * Resend API) — selected in invitations.module.ts by the EMAIL_PROVIDER env var. Swapping to a
 * different real provider means adding another implementation behind this interface, not
 * changing any use case. See docs/permissions.md. */
export interface EmailAdapter {
  sendInvitation(params: SendInvitationEmailParams): Promise<void>;
}
