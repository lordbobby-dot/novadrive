"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminAnalytics } from "@/hooks/use-admin";
import { SimpleLineChart } from "@/components/admin/simple-line-chart";
import { formatBytes } from "@/lib/format-bytes";
import { cn } from "@/lib/utils";

const WINDOW_OPTIONS = [7, 30, 90] as const;

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-1 flex-col gap-1 rounded-lg border border-border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-2xl font-semibold tracking-tight">{value}</span>
    </div>
  );
}

export default function AdminAnalyticsPage() {
  const [windowDays, setWindowDays] = useState<(typeof WINDOW_OPTIONS)[number]>(30);
  const { data, isLoading } = useAdminAnalytics(windowDays);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Analytics</h1>
        <div className="flex gap-1">
          {WINDOW_OPTIONS.map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                windowDays === days
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <>
          <div className="flex gap-4">
            <StatCard label="Total users" value={data.totalUserCount} />
            <StatCard label="Total organizations" value={data.totalOrganizationCount} />
            <StatCard
              label={`Active users (last ${data.windowDays}d)`}
              value={data.activeUserCount}
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Signups per day
            </h2>
            <SimpleLineChart
              ariaLabel="Signups per day"
              data={data.signupsByDay.map((row) => ({ label: row.day, value: row.count }))}
            />
          </div>

          <div className="rounded-lg border border-border p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Cumulative storage uploaded
            </h2>
            <SimpleLineChart
              ariaLabel="Cumulative storage uploaded"
              color="var(--chart-2)"
              data={data.storageGrowthByDay.map((row) => ({
                label: row.day,
                value: Number(row.cumulativeBytes),
              }))}
            />
            {data.storageGrowthByDay.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Latest:{" "}
                {formatBytes(
                  data.storageGrowthByDay[data.storageGrowthByDay.length - 1].cumulativeBytes,
                )}{" "}
                uploaded total (never decreases — deletions aren&apos;t reflected, see docs/admin.md)
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
