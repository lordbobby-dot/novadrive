export interface SharedWithMeItemResponse {
  type: "file" | "folder";
  id: string;
  name: string;
  parentOrFolderId: string | null;
  contentType: string | null;
  size: string | null;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER" | "GUEST";
  ownerId: string;
  ownerName: string | null;
  grantedAt: string;
}

export interface SharedWithMePageResponse {
  items: SharedWithMeItemResponse[];
  nextCursor: string | null;
}
