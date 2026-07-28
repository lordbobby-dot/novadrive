import { AlertCircle, Loader2 } from "lucide-react";

export function PreviewStatus({
  isLoading,
  error,
}: {
  isLoading: boolean;
  error: Error | null;
}) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
        <AlertCircle className="size-8 text-destructive" />
        <p className="text-sm">{error.message}</p>
      </div>
    );
  }
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return null;
}
