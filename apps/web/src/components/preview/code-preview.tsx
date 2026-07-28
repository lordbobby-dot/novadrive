"use client";

import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useFileText } from "@/hooks/use-file-text";
import { detectCodeLanguage } from "@/lib/preview-kind";
import { PreviewStatus } from "./preview-status";

// react-syntax-highlighter (+ its Prism language bundle) is sizeable — keep it out of the
// main preview-dialog chunk and only load it when a code file is actually opened.
const SyntaxHighlighter = dynamic(
  () => import("react-syntax-highlighter").then((mod) => mod.Prism),
  { ssr: false },
);

export function CodePreview({ url, fileName }: { url: string; fileName: string }) {
  const { data, isLoading, error } = useFileText(url);
  const { resolvedTheme } = useTheme();

  if (isLoading || error || !data) {
    return <PreviewStatus isLoading={isLoading} error={error} />;
  }

  return (
    <div className="h-full overflow-auto">
      <SyntaxHighlighter
        language={detectCodeLanguage(fileName)}
        style={resolvedTheme === "dark" ? oneDark : oneLight}
        showLineNumbers
        customStyle={{ margin: 0, height: "100%", fontSize: "0.8rem" }}
      >
        {data}
      </SyntaxHighlighter>
    </div>
  );
}
