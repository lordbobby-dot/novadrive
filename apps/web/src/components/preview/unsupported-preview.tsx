import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";

export function UnsupportedPreview({
  fileName,
  onDownload,
}: {
  fileName: string;
  onDownload: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <FileQuestion className="size-16 text-muted-foreground" />
      <p className="max-w-md truncate text-sm text-muted-foreground">{fileName}</p>
      <p className="text-sm text-muted-foreground">No preview available for this file type.</p>
      <Button onClick={onDownload}>Download</Button>
    </div>
  );
}
