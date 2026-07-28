"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { Toaster } from "sonner";
import { RealtimeProvider } from "@/lib/realtime-context";
import { CommandPalette } from "@/components/command-palette/command-palette";
import { GlobalShortcuts } from "@/components/command-palette/global-shortcuts";
import { ShortcutsSheet } from "@/components/command-palette/shortcuts-sheet";

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return <Toaster theme={resolvedTheme === "dark" ? "dark" : "light"} richColors position="bottom-right" />;
}

// Module-level singleton (not per-request) — this app is purely client-rendered behind
// Clerk auth, so there's no SSR data-fetching that would need request isolation. Exported
// so lib/upload-manager.ts can invalidate folder/file queries when an upload completes.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        <RealtimeProvider>
          {children}
          <GlobalShortcuts />
          <CommandPalette />
          <ShortcutsSheet />
          <ThemedToaster />
        </RealtimeProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
