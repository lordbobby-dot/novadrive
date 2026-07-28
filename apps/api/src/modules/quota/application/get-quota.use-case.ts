import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageBreakdownEntry,
  type StorageQuotaRepository,
} from '../domain/storage-quota.repository';
import type {
  QuotaSubjectType,
  StorageQuota,
} from '../domain/storage-quota.entity';

export interface QuotaWithBreakdown {
  quota: StorageQuota;
  breakdown: StorageBreakdownEntry[];
}

/** Personal quota (`subjectType: 'USER'`) needs no permission check — every actor can always see
 * their own. Org quota requires VIEWER+ membership, same bar as seeing anything else about the
 * org. Never force-creates a StorageQuota row on a read — a subject that's never attempted an
 * upload gets a synthesized zero-usage response reflecting the default limit they'd get on first
 * reservation, without a phantom row appearing before they've done anything. */
@Injectable()
export class GetQuotaUseCase {
  constructor(
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
    private readonly orgRoles: OrgRoleResolver,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async execute(
    actorId: string,
    subjectType: QuotaSubjectType,
    subjectId: string,
  ): Promise<QuotaWithBreakdown> {
    if (subjectType === 'ORGANIZATION') {
      await this.orgRoles.requireRole(actorId, subjectId, 'VIEWER');
    }

    const [existing, breakdown] = await Promise.all([
      this.quotas.findBySubject(subjectType, subjectId),
      this.quotas.getBreakdownBySubject(subjectType, subjectId),
    ]);

    const quota: StorageQuota = existing ?? {
      id: '',
      subjectType,
      subjectId,
      limitBytes: String(
        subjectType === 'ORGANIZATION'
          ? this.config.get('DEFAULT_ORG_QUOTA_BYTES', { infer: true })
          : this.config.get('DEFAULT_USER_QUOTA_BYTES', { infer: true }),
      ),
      usedBytes: '0',
      lastNotifiedThreshold: 0,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };

    return { quota, breakdown };
  }
}
