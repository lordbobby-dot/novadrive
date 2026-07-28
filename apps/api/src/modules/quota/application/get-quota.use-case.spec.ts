import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetQuotaUseCase } from './get-quota.use-case';
import type { StorageQuotaRepository } from '../domain/storage-quota.repository';
import type { OrgRoleResolver } from '../../organizations/domain/org-role-resolver.service';
import type { EnvConfig } from '../../../config/env.validation';
import type { StorageQuota } from '../domain/storage-quota.entity';

describe('GetQuotaUseCase', () => {
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let orgRoles: jest.Mocked<OrgRoleResolver>;
  let config: ConfigService<EnvConfig, true>;
  let useCase: GetQuotaUseCase;

  beforeEach(() => {
    quotas = {
      findBySubject: jest.fn(),
      findManyBySubjects: jest.fn(),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn().mockResolvedValue([]),
    };
    orgRoles = {
      resolveRole: jest.fn(),
      requireRole: jest.fn(),
    } as unknown as jest.Mocked<OrgRoleResolver>;
    config = {
      get: jest.fn((key: string) => {
        if (key === 'DEFAULT_USER_QUOTA_BYTES') return 1000;
        if (key === 'DEFAULT_ORG_QUOTA_BYTES') return 10_000;
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;
    useCase = new GetQuotaUseCase(quotas, orgRoles, config);
  });

  it("requires no permission check for the caller's own USER quota", async () => {
    quotas.findBySubject.mockResolvedValue(null);
    await useCase.execute('actor-1', 'USER', 'actor-1');
    expect(orgRoles.requireRole).not.toHaveBeenCalled();
  });

  it('requires VIEWER+ org role for an ORGANIZATION quota', async () => {
    orgRoles.requireRole.mockRejectedValue(new ForbiddenException());
    await expect(
      useCase.execute('actor-1', 'ORGANIZATION', 'org-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('synthesizes a zero-usage quota at the default limit when no row exists yet', async () => {
    quotas.findBySubject.mockResolvedValue(null);

    const result = await useCase.execute('actor-1', 'USER', 'actor-1');

    expect(result.quota.usedBytes).toBe('0');
    expect(result.quota.limitBytes).toBe('1000');
  });

  it('returns the real quota row when one exists', async () => {
    const real: StorageQuota = {
      id: 'quota-1',
      subjectType: 'USER',
      subjectId: 'actor-1',
      limitBytes: '1000',
      usedBytes: '400',
      lastNotifiedThreshold: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    quotas.findBySubject.mockResolvedValue(real);

    const result = await useCase.execute('actor-1', 'USER', 'actor-1');

    expect(result.quota).toBe(real);
  });

  it('includes the content-type breakdown', async () => {
    quotas.findBySubject.mockResolvedValue(null);
    quotas.getBreakdownBySubject.mockResolvedValue([
      { contentType: 'image/png', totalBytes: '500' },
    ]);

    const result = await useCase.execute('actor-1', 'USER', 'actor-1');

    expect(result.breakdown).toEqual([
      { contentType: 'image/png', totalBytes: '500' },
    ]);
  });
});
