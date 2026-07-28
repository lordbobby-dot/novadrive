import { Inject, Injectable } from '@nestjs/common';
import {
  buildCursorPage,
  type CursorPage,
} from '../../../common/pagination/cursor-page';
import type { User } from '../../users/domain/user.entity';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import {
  STORAGE_QUOTA_REPOSITORY,
  type StorageQuotaRepository,
} from '../../quota/domain/storage-quota.repository';

export interface ListAdminUsersParams {
  search?: string;
  cursor?: string;
  limit: number;
}

export interface AdminUserSummary extends User {
  storageUsedBytes: string;
  /** null if this user has never attempted an upload — no StorageQuota row exists yet, so
   * whatever DEFAULT_USER_QUOTA_BYTES is configured to right now would apply on their first one. */
  storageLimitBytes: string | null;
}

@Injectable()
export class ListAdminUsersUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(STORAGE_QUOTA_REPOSITORY)
    private readonly quotas: StorageQuotaRepository,
  ) {}

  async execute(
    params: ListAdminUsersParams,
  ): Promise<CursorPage<AdminUserSummary>> {
    const rows = await this.users.list(params);
    const page = buildCursorPage(rows, params.limit);

    const quotas = await this.quotas.findManyBySubjects(
      'USER',
      page.items.map((user) => user.id),
    );
    const quotaByUserId = new Map(
      quotas.map((quota) => [quota.subjectId, quota]),
    );

    return {
      ...page,
      items: page.items.map((user) => {
        const quota = quotaByUserId.get(user.id);
        return {
          ...user,
          storageUsedBytes: quota?.usedBytes ?? '0',
          storageLimitBytes: quota?.limitBytes ?? null,
        };
      }),
    };
  }
}
