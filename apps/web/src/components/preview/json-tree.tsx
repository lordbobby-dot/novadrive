"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function valueLabel(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function valueColorClass(value: JsonValue): string {
  if (value === null) return "text-muted-foreground";
  if (typeof value === "string") return "text-emerald-600 dark:text-emerald-400";
  if (typeof value === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof value === "boolean") return "text-amber-600 dark:text-amber-400";
  return "";
}

function JsonNode({ label, value, depth }: { label: string | null; value: JsonValue; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isObject = typeof value === "object" && value !== null;

  if (!isObject) {
    return (
      <div className="flex items-start gap-1 py-0.5 pl-5 font-mono text-xs">
        {label !== null && <span className="text-muted-foreground">{label}:</span>}
        <span className={valueColorClass(value)}>{valueLabel(value)}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value);

  return (
    <div className="font-mono text-xs">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex items-center gap-1 py-0.5 hover:bg-muted/50"
      >
        <ChevronRight className={cn("size-3 shrink-0 transition-transform", expanded && "rotate-90")} />
        {label !== null && <span className="text-muted-foreground">{label}:</span>}
        <span className="text-muted-foreground">
          {isArray ? `Array(${entries.length})` : `Object(${entries.length})`}
        </span>
      </button>
      {expanded && (
        <div className="border-l border-border pl-2">
          {entries.map(([key, val]) => (
            <JsonNode key={key} label={key} value={val} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function JsonTree({ value }: { value: JsonValue }) {
  return <JsonNode label={null} value={value} depth={0} />;
}
