"use client";

import { useMemo } from "react";
import { useFileText } from "@/hooks/use-file-text";
import { PreviewStatus } from "./preview-status";
import { JsonTree } from "./json-tree";

export function JsonPreview({ url }: { url: string }) {
  const { data, isLoading, error } = useFileText(url);

  const parsed = useMemo(() => {
    if (!data) return null;
    try {
      return { ok: true as const, value: JSON.parse(data) as Parameters<typeof JsonTree>[0]["value"] };
    } catch {
      return { ok: false as const };
    }
  }, [data]);

  if (isLoading || error || !data) {
    return <PreviewStatus isLoading={isLoading} error={error} />;
  }
  if (!parsed?.ok) {
    return <PreviewStatus isLoading={false} error={new Error("This file isn't valid JSON.")} />;
  }

  return (
    <div className="h-full overflow-auto p-4">
      <JsonTree value={parsed.value} />
    </div>
  );
}
