import { auth } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme-toggle";

interface MeResponse {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

async function getCurrentUser(): Promise<MeResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  // Server-side fetches run inside this container/process, not the browser — NEXT_PUBLIC_API_URL
  // is baked in at build time for the browser's benefit and may point at a host-published port
  // (e.g. localhost:4000) that isn't reachable from inside a container. API_INTERNAL_URL is a
  // runtime-only, server-only override for that case (e.g. http://api:4000 in Docker Compose).
  const apiBaseUrl =
    process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  const response = await fetch(`${apiBaseUrl}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }
  return response.json() as Promise<MeResponse>;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <main className="flex min-h-screen flex-col gap-8 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <UserButton />
        </div>
      </div>

      {user ? (
        <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-6">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatarUrl} alt="" className="size-12 rounded-full" />
          ) : null}
          <div>
            <p className="font-medium">{user.name ?? user.email}</p>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              Member since {new Date(user.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-sm text-destructive">
          Couldn&apos;t load your profile from the API. Confirm the API is running and that
          CLERK_SECRET_KEY / CLERK_WEBHOOK_SIGNING_SECRET are configured in apps/api/.env.
        </p>
      )}
    </main>
  );
}
