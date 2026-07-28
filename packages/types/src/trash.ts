export interface TrashItemResponse {
  /** Pass this to DELETE /trash/:id/permanent — not the same as `id`. */
  trashId: string;
  type: "file" | "folder";
  /** The file or folder's own id — pass this to restore endpoints. */
  id: string;
  name: string;
  deletedAt: string;
}
