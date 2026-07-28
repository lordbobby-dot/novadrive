export interface File {
  id: string;
  name: string;
  ownerId: string;
  folderId: string;
  storageObjectId: string;
  contentType: string;
  size: string;
  /** Internal S3 location — never serialize these onto a public-facing DTO directly; they exist
   * on the domain entity purely so use cases (e.g. signed-URL issuance) can read them without a
   * separate repository round-trip. */
  bucket: string;
  objectKey: string;
  region: string;
  lastAccessedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
