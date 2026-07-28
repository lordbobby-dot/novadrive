export type QuotaSubjectType = 'USER' | 'ORGANIZATION';

export interface QuotaSubject {
  subjectType: QuotaSubjectType;
  subjectId: string;
}

export interface StorageQuota {
  id: string;
  subjectType: QuotaSubjectType;
  subjectId: string;
  limitBytes: string;
  usedBytes: string;
  lastNotifiedThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export function percentUsed(
  quota: Pick<StorageQuota, 'usedBytes' | 'limitBytes'>,
): number {
  const used = BigInt(quota.usedBytes);
  const limit = BigInt(quota.limitBytes);
  if (limit <= 0n) return 100;
  return Number((used * 100n) / limit);
}
