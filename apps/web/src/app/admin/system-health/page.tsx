"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import type { HealthCheckResult } from "@novadrive/types";
import { Skeleton } from "@/components/ui/skeleton";
import { useSystemHealth } from "@/hooks/use-admin";
import { cn } from "@/lib/utils";

function StatusRow({ label, result }: { label: string; result: HealthCheckResult }) {
  const isUp = result.status === "up";
  return (
    <div className="flex items-center gap-3 rounded-md border border-border px-4 py-3">
      {isUp ? (
        <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />
      ) : (
        <XCircle className="size-5 shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {result.error && (
          <div className="truncate text-xs text-destructive">{result.error}</div>
        )}
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
          isUp ? "bg-emerald-500/10 text-emerald-600" : "bg-destructive/10 text-destructive",
        )}
      >
        {isUp ? "Up" : "Down"}
      </span>
      {result.latencyMs !== undefined && (
        <span className="shrink-0 text-xs text-muted-foreground">{result.latencyMs}ms</span>
      )}
    </div>
  );
}

export default function AdminSystemHealthPage() {
  const { data, isLoading } = useSystemHealth();

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">System Health</h1>
        {data && (
          <span className="text-xs text-muted-foreground">
            Last checked {new Date(data.checkedAt).toLocaleTimeString()} · refreshes every 30s
          </span>
        )}
      </div>

      {isLoading || !data ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <StatusRow label="Postgres" result={data.database} />
            <StatusRow label="Redis" result={data.redis} />
            <StatusRow label="S3" result={data.s3} />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              Background job queues
            </h2>
            <div className="flex flex-col gap-1">
              {data.queues.map((queue) => (
                <div
                  key={queue.name}
                  className="flex items-center gap-6 rounded-md border border-border px-4 py-2 text-sm"
                >
                  <span className="w-48 shrink-0 font-medium">{queue.name}</span>
                  <span className="text-muted-foreground">Waiting: {queue.waiting}</span>
                  <span className="text-muted-foreground">Active: {queue.active}</span>
                  <span className={cn(queue.failed > 0 && "text-destructive")}>
                    Failed: {queue.failed}
                  </span>
                  <span className="text-muted-foreground">Delayed: {queue.delayed}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
