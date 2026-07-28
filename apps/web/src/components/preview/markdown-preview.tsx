import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useFileText } from "@/hooks/use-file-text";
import { PreviewStatus } from "./preview-status";

export function MarkdownPreview({ url }: { url: string }) {
  const { data, isLoading, error } = useFileText(url);

  if (isLoading || error || !data) {
    return <PreviewStatus isLoading={isLoading} error={error} />;
  }

  return (
    <div className="h-full overflow-auto p-6">
      <article className="prose prose-sm dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{data}</ReactMarkdown>
      </article>
    </div>
  );
}
