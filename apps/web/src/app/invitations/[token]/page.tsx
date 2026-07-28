import { InvitationAcceptView } from "@/components/invitations/invitation-accept-view";

export default async function InvitationAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <InvitationAcceptView token={token} />;
}
