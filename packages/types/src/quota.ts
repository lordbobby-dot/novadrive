export type QuotaSubjectType = "USER" | "ORGANIZATION";

export interface StorageBreakdownEntry {
  contentType: string;
  totalBytes: string;
}

export interface QuotaResponse {
  subjectType: QuotaSubjectType;
  subjectId: string;
  limitBytes: string;
  usedBytes: string;
  percentUsed: number;
  breakdown: StorageBreakdownEntry[];
}
