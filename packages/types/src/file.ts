export interface FileResponse {
  id: string;
  name: string;
  folderId: string;
  contentType: string;
  /** Bytes, as a string — safe for values beyond Number.MAX_SAFE_INTEGER. */
  size: string;
  createdAt: string;
  updatedAt: string;
}
