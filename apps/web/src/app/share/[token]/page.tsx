import { ShareLinkView } from "@/components/share/share-link-view";

export default async function ShareLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ShareLinkView token={token} />;
}
