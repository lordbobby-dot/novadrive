import { ConfigService } from '@nestjs/config';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { QuotaService } from './quota.service';
import { QuotaExceededException } from './quota-exceeded.exception';
import type { StorageQuotaRepository } from './storage-quota.repository';
import type { EnvConfig } from '../../../config/env.validation';
import type { StorageQuota } from './storage-quota.entity';

function makeQuota(overrides: Partial<StorageQuota> = {}): StorageQuota {
  return {
    id: 'quota-1',
    subjectType: 'USER',
    subjectId: 'owner-1',
    limitBytes: '1000',
    usedBytes: '0',
    lastNotifiedThreshold: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('QuotaService', () => {
  let quotas: jest.Mocked<StorageQuotaRepository>;
  let config: ConfigService<EnvConfig, true>;
  let events: jest.Mocked<EventEmitter2>;
  let service: QuotaService;

  beforeEach(() => {
    quotas = {
      findBySubject: jest.fn(),
      findManyBySubjects: jest.fn(),
      getOrCreate: jest.fn(),
      setLimit: jest.fn(),
      tryReserve: jest.fn(),
      release: jest.fn(),
      updateLastNotifiedThreshold: jest.fn(),
      getBreakdownBySubject: jest.fn(),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'DEFAULT_USER_QUOTA_BYTES') return 1000;
        if (key === 'DEFAULT_ORG_QUOTA_BYTES') return 10_000;
        return undefined;
      }),
    } as unknown as ConfigService<EnvConfig, true>;
    events = { emit: jest.fn() } as unknown as jest.Mocked<EventEmitter2>;
    service = new QuotaService(quotas, config, events);
  });

  describe('reserve', () => {
    it('lazily creates the quota row with the default limit before reserving', async () => {
      quotas.getOrCreate.mockResolvedValue(makeQuota());
      quotas.tryReserve.mockResolvedValue(makeQuota({ usedBytes: '100' }));

      await service.reserve(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '100',
      );

      expect(quotas.getOrCreate).toHaveBeenCalledWith('USER', 'owner-1', 1000);
      expect(quotas.tryReserve).toHaveBeenCalledWith('USER', 'owner-1', '100');
    });

    it('uses the org default limit for an ORGANIZATION subject', async () => {
      quotas.getOrCreate.mockResolvedValue(
        makeQuota({ subjectType: 'ORGANIZATION', subjectId: 'org-1' }),
      );
      quotas.tryReserve.mockResolvedValue(
        makeQuota({
          subjectType: 'ORGANIZATION',
          subjectId: 'org-1',
          usedBytes: '100',
        }),
      );

      await service.reserve(
        { subjectType: 'ORGANIZATION', subjectId: 'org-1' },
        '100',
      );

      expect(quotas.getOrCreate).toHaveBeenCalledWith(
        'ORGANIZATION',
        'org-1',
        10_000,
      );
    });

    it('throws QuotaExceededException when the atomic reservation is rejected, without notifying', async () => {
      quotas.getOrCreate.mockResolvedValue(makeQuota());
      quotas.tryReserve.mockResolvedValue(null);

      await expect(
        service.reserve({ subjectType: 'USER', subjectId: 'owner-1' }, '2000'),
      ).rejects.toBeInstanceOf(QuotaExceededException);
      expect(quotas.updateLastNotifiedThreshold).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('fires an 80% threshold notification exactly once when crossed', async () => {
      quotas.getOrCreate.mockResolvedValue(makeQuota());
      quotas.tryReserve.mockResolvedValue(
        makeQuota({ usedBytes: '850', lastNotifiedThreshold: 0 }),
      );

      await service.reserve(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '850',
      );

      expect(quotas.updateLastNotifiedThreshold).toHaveBeenCalledWith(
        'USER',
        'owner-1',
        80,
      );
      expect(events.emit).toHaveBeenCalledWith(
        'quota.threshold',
        expect.objectContaining({ thresholdPercent: 80 }),
      );
    });

    it('jumping straight from 10% to 97% fires only the highest threshold crossed (95), not 80 too', async () => {
      quotas.getOrCreate.mockResolvedValue(makeQuota());
      quotas.tryReserve.mockResolvedValue(
        makeQuota({ usedBytes: '970', lastNotifiedThreshold: 0 }),
      );

      await service.reserve(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '870',
      );

      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith(
        'quota.threshold',
        expect.objectContaining({ thresholdPercent: 95 }),
      );
    });

    it('does not re-fire the same threshold on a second reservation that stays in the same band', async () => {
      quotas.getOrCreate.mockResolvedValue(makeQuota());
      quotas.tryReserve.mockResolvedValue(
        makeQuota({ usedBytes: '850', lastNotifiedThreshold: 80 }),
      );

      await service.reserve(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '10',
      );

      expect(quotas.updateLastNotifiedThreshold).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('fires 100% once usage reaches the limit exactly', async () => {
      quotas.getOrCreate.mockResolvedValue(makeQuota());
      quotas.tryReserve.mockResolvedValue(
        makeQuota({ usedBytes: '1000', lastNotifiedThreshold: 95 }),
      );

      await service.reserve(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '50',
      );

      expect(events.emit).toHaveBeenCalledWith(
        'quota.threshold',
        expect.objectContaining({ thresholdPercent: 100 }),
      );
    });
  });

  describe('release', () => {
    it('releases the given bytes', async () => {
      quotas.release.mockResolvedValue(makeQuota({ usedBytes: '400' }));

      await service.release(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '600',
      );

      expect(quotas.release).toHaveBeenCalledWith('USER', 'owner-1', '600');
    });

    it('resets the notification ratchet once usage drops back below the lowest threshold', async () => {
      quotas.release.mockResolvedValue(
        makeQuota({ usedBytes: '700', lastNotifiedThreshold: 80 }),
      );

      await service.release(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '300',
      );

      expect(quotas.updateLastNotifiedThreshold).toHaveBeenCalledWith(
        'USER',
        'owner-1',
        0,
      );
    });

    it('does not reset the ratchet if usage is still at/above the lowest threshold', async () => {
      quotas.release.mockResolvedValue(
        makeQuota({ usedBytes: '850', lastNotifiedThreshold: 95 }),
      );

      await service.release(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '50',
      );

      expect(quotas.updateLastNotifiedThreshold).not.toHaveBeenCalled();
    });

    it('does nothing to the ratchet if nothing had been notified yet', async () => {
      quotas.release.mockResolvedValue(
        makeQuota({ usedBytes: '10', lastNotifiedThreshold: 0 }),
      );

      await service.release(
        { subjectType: 'USER', subjectId: 'owner-1' },
        '990',
      );

      expect(quotas.updateLastNotifiedThreshold).not.toHaveBeenCalled();
    });
  });

  describe('releaseMany', () => {
    it('groups items by subject and issues one release per subject', async () => {
      quotas.release.mockResolvedValue(makeQuota());

      await service.releaseMany([
        { size: '100', quotaSubjectType: 'USER', quotaSubjectId: 'owner-1' },
        { size: '200', quotaSubjectType: 'USER', quotaSubjectId: 'owner-1' },
        {
          size: '50',
          quotaSubjectType: 'ORGANIZATION',
          quotaSubjectId: 'org-1',
        },
        { size: '999', quotaSubjectType: null, quotaSubjectId: null },
      ]);

      expect(quotas.release).toHaveBeenCalledTimes(2);
      expect(quotas.release).toHaveBeenCalledWith('USER', 'owner-1', '300');
      expect(quotas.release).toHaveBeenCalledWith(
        'ORGANIZATION',
        'org-1',
        '50',
      );
    });

    it('does nothing for an empty list', async () => {
      await service.releaseMany([]);
      expect(quotas.release).not.toHaveBeenCalled();
    });
  });
});
