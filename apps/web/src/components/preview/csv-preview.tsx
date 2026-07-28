"use client";

import Papa from "papaparse";
import { useMemo } from "react";
import { useFileText } from "@/hooks/use-file-text";
import { PreviewStatus } from "./preview-status";

export function CsvPreview({ url }: { url: string }) {
  const { data, isLoading, error } = useFileText(url);

  const rows = useMemo(() => {
    if (!data) return [];
    return Papa.parse<string[]>(data.trim(), { skipEmptyLines: true }).data;
  }, [data]);

  if (isLoading || error || !data) {
    return <PreviewStatus isLoading={isLoading} error={error} />;
  }
  if (rows.length === 0) {
    return <PreviewStatus isLoading={false} error={new Error("This CSV file is empty.")} />;
  }

  const [header, ...body] = rows;

  return (
    <div className="h-full overflow-auto p-4">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-background">
          <tr>
            {header.map((cell, i) => (
              <th key={i} className="border-b border-border px-3 py-2 text-left font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-muted/30">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="border-b border-border/50 px-3 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
