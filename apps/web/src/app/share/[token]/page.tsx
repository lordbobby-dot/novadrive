import type { Metadata } from "next";
import { ShareLinkView } from "@/components/share/share-link-view";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ShareLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ShareLinkView token={token} />;
}
