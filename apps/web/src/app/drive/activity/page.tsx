"use client";

import { useState } from "react";
import type { ActivityAction } from "@novadrive/types";
import { ActivityFeedList } from "@/components/activity/activity-feed-list";

const ACTIONS: ActivityAction[] = [
  "UPLOAD",
  "DOWNLOAD",
  "DELETE",
  "RESTORE",
  "RENAME",
  "MOVE",
  "COPY",
  "VERSION_RESTORE",
];

export default function ActivityPage() {
  const [action, setAction] = useState<ActivityAction | "">("");

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-semibold">Activity</h1>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value as ActivityAction | "")}
          className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* key forces a remount on filter change so the list's internal pagination/accumulation
          state (cursor, accumulated items) resets instead of mixing pages across filters. */}
      <ActivityFeedList key={action} filters={{ action: action || undefined, limit: 30 }} />
    </div>
  );
}
