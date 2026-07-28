import { Music } from "lucide-react";

export function AudioPreview({ url, fileName }: { url: string; fileName: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6">
      <Music className="size-16 text-muted-foreground" />
      <p className="max-w-md truncate text-sm text-muted-foreground">{fileName}</p>
      <audio src={url} controls preload="metadata" className="w-full max-w-md" />
    </div>
  );
}
