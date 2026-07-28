import type { Metadata } from "next";
import { InvitationAcceptView } from "@/components/invitations/invitation-accept-view";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function InvitationAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InvitationAcceptView token={token} />;
}
