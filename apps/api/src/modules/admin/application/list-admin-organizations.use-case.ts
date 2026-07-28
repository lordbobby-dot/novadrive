import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import {
  ORGANIZATION_REPOSITORY,
  type OrganizationRepository,
  type OrganizationWithCounts,
} from '../../organizations/domain/organization.repository';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageQuotaRepository,
} from '../../quota/domain/storage-quota.repository';

export interface ListAdminOrganizationsParams {
  search?: string;
  cursor?: string;
  limit: number;
}

export interface AdminOrganizationSummary extends OrganizationWithCounts {
  storageUsedBytes: string;
  storageLimitBytes: string | null;
}

@Injectable()
export class ListAdminOrganizationsUseCase {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizations: OrganizationRepository,
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
  ) {}

  async execute(
    params: ListAdminOrganizationsParams,
  ): Promise<CursorPage<AdminOrganizationSummary>> {
    const rows = await this.organizations.listAll(params);
    const page = buildCursorPage(rows, params.limit);

    const quotas = await this.quotas.findManyBySubjects(
      'ORGANIZATION',
      page.items.map((org) => org.id),
    );
    const quotaByOrgId = new Map(
      quotas.map((quota) => [quota.subjectId, quota]),
    );

    return {
      ...page,
      items: page.items.map((org) => {
        const quota = quotaByOrgId.get(org.id);
        return {
          ...org,
          storageUsedBytes: quota?.usedBytes ?? '0',
          storageLimitBytes: quota?.limitBytes ?? null,
        };
      }),
    };
  }
}
