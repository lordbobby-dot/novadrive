import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import type { FolderResponse } from "@novadrive/types";

export default async function DrivePage() {
  const { getToken } = await auth();
  const token = await getToken();
  // See dashboard/page.tsx for why this isn't just NEXT_PUBLIC_API_URL: that's baked in at build
  // time for the browser and may be unreachable from inside this container (e.g. localhost:4000
  // published on the host, not the api container's own network).
  const apiBaseUrl =
    process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  const response = await fetch(`${apiBaseUrl}/folders/root`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load your Drive. Confirm the API is reachable and configured.");
  }

  const root = (await response.json()) as FolderResponse;
  redirect(`/drive/${root.id}`);
}
