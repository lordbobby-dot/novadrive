export interface SignedUrlResponse {
  /** Presigned S3 URL — fetch it directly, never proxy it through the API. */
  url: string;
  expiresAt: string;
  fileName: string;
  contentType: string;
  /** Bytes, as a string — safe for values beyond Number.MAX_SAFE_INTEGER. */
  size: string;
}
