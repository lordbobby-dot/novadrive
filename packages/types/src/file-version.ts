export interface FileVersionResponse {
  id: string;
  fileId: string;
  versionNumber: number;
  createdBy: string;
  changeNote: string | null;
  createdAt: string;
  contentType: string;
  /** Bytes, as a string — safe for values beyond Number.MAX_SAFE_INTEGER. */
  size: string;
  /** Not necessarily the highest versionNumber — restoring an earlier version moves this flag
   * without renumbering anything. */
  isCurrent: boolean;
}
