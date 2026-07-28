"use client";

import { useRef, type ChangeEvent } from "react";
import { useAuth } from "@clerk/nextjs";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enqueueUpload } from "@/lib/upload-manager";

export function UploadButton({ folderId }: { folderId: string }) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      enqueueUpload(crypto.randomUUID(), file, folderId, getToken);
    }
    event.target.value = "";
  }

  return (
    <>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleChange} />
      <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" />
        Upload
      </Button>
    </>
  );
}
