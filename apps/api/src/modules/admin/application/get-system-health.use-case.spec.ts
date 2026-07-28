import { GetSystemHealthUseCase } from './get-system-health.use-case';
import type { DependencyHealthService } from '../../../infrastructure/health/dependency-health.service';

describe('GetSystemHealthUseCase', () => {
  let dependencyHealth: jest.Mocked<DependencyHealthService>;
  let checksumQueue: { getJobCounts: jest.Mock; name: string };
  let trashQueue: { getJobCounts: jest.Mock; name: string };
  let useCase: GetSystemHealthUseCase;

  beforeEach(() => {
    dependencyHealth = {
      checkDatabase: jest
        .fn()
        .mockResolvedValue({ status: 'up', latencyMs: 5 }),
      checkRedis: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 3 }),
      checkS3: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 40 }),
    } as unknown as jest.Mocked<DependencyHealthService>;
    checksumQueue = {
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 1, active: 0, failed: 0, delayed: 0 }),
      name: 'checksum-verification',
    };
    trashQueue = {
      getJobCounts: jest
        .fn()
        .mockResolvedValue({ waiting: 0, active: 0, failed: 2, delayed: 0 }),
      name: 'trash-cleanup',
    };
    useCase = new GetSystemHealthUseCase(
      dependencyHealth,
      checksumQueue as never,
      trashQueue as never,
    );
  });

  it('delegates database/redis/s3 checks to DependencyHealthService and layers queue depth on top', async () => {
    const result = await useCase.execute();

    expect(dependencyHealth.checkDatabase).toHaveBeenCalled();
    expect(dependencyHealth.checkRedis).toHaveBeenCalled();
    expect(dependencyHealth.checkS3).toHaveBeenCalled();
    expect(result.database).toEqual({ status: 'up', latencyMs: 5 });
    expect(result.redis).toEqual({ status: 'up', latencyMs: 3 });
    expect(result.s3).toEqual({ status: 'up', latencyMs: 40 });
    expect(result.queues).toEqual([
      {
        name: 'checksum-verification',
        waiting: 1,
        active: 0,
        failed: 0,
        delayed: 0,
      },
      { name: 'trash-cleanup', waiting: 0, active: 0, failed: 2, delayed: 0 },
    ]);
  });

  it('passes through a down dependency reported by DependencyHealthService unchanged', async () => {
    dependencyHealth.checkDatabase.mockResolvedValue({
      status: 'down',
      error: 'connection refused',
    });

    const result = await useCase.execute();

    expect(result.database).toEqual({
      status: 'down',
      error: 'connection refused',
    });
  });
});
