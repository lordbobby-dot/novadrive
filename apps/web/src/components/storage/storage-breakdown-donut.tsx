"use client";

import type { StorageBreakdownEntry } from "@novadrive/types";
import { formatBytes } from "@/lib/format-bytes";

interface Category {
  label: string;
  match: (contentType: string) => boolean;
  color: string;
}

const CATEGORIES: Category[] = [
  { label: "Images", match: (ct) => ct.startsWith("image/"), color: "var(--chart-1)" },
  { label: "Videos", match: (ct) => ct.startsWith("video/"), color: "var(--chart-2)" },
  { label: "Audio", match: (ct) => ct.startsWith("audio/"), color: "var(--chart-3)" },
  {
    label: "Documents",
    match: (ct) =>
      ct.startsWith("text/") ||
      ct === "application/pdf" ||
      ct.includes("document") ||
      ct.includes("spreadsheet") ||
      ct.includes("presentation"),
    color: "var(--chart-4)",
  },
  { label: "Other", match: () => true, color: "var(--chart-5)" },
];

function categorize(breakdown: StorageBreakdownEntry[]): { label: string; color: string; bytes: bigint }[] {
  const totals = new Map<string, bigint>();
  for (const entry of breakdown) {
    const category = CATEGORIES.find((c) => c.match(entry.contentType))!;
    totals.set(category.label, (totals.get(category.label) ?? BigInt(0)) + BigInt(entry.totalBytes));
  }
  return CATEGORIES.map((c) => ({ label: c.label, color: c.color, bytes: totals.get(c.label) ?? BigInt(0) })).filter(
    (c) => c.bytes > BigInt(0),
  );
}

const SIZE = 120;
const STROKE = 16;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StorageBreakdownDonut({ breakdown }: { breakdown: StorageBreakdownEntry[] }) {
  const segments = categorize(breakdown);
  const total = segments.reduce((sum, s) => sum + s.bytes, BigInt(0));

  if (total === BigInt(0)) {
    return (
      <div className="flex items-center gap-4">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="No storage used yet">
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={STROKE}
          />
        </svg>
        <p className="text-sm text-muted-foreground">No files yet</p>
      </div>
    );
  }

  let offset = 0;
  const totalNumber = Number(total);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Storage usage by file type">
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {segments.map((segment) => {
            const fraction = Number(segment.bytes) / totalNumber;
            const dash = fraction * CIRCUMFERENCE;
            const circle = (
              <circle
                key={segment.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={STROKE}
                strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return circle;
          })}
        </g>
      </svg>
      <ul className="flex flex-col gap-1.5 text-sm">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: segment.color }}
            />
            <span className="min-w-0 flex-1">{segment.label}</span>
            <span className="text-muted-foreground">{formatBytes(segment.bytes.toString())}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
