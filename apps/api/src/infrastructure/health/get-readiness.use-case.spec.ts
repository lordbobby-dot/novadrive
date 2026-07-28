import { GetReadinessUseCase } from './get-readiness.use-case';
import type { DependencyHealthService } from './dependency-health.service';

describe('GetReadinessUseCase', () => {
  let dependencyHealth: jest.Mocked<DependencyHealthService>;
  let useCase: GetReadinessUseCase;

  beforeEach(() => {
    dependencyHealth = {
      checkDatabase: jest.fn().mockResolvedValue({ status: 'up' }),
      checkRedis: jest.fn().mockResolvedValue({ status: 'up' }),
      checkS3: jest.fn().mockResolvedValue({ status: 'up' }),
    } as unknown as jest.Mocked<DependencyHealthService>;
    useCase = new GetReadinessUseCase(dependencyHealth);
  });

  it('reports ok when every dependency is up', async () => {
    const result = await useCase.execute();
    expect(result.status).toBe('ok');
  });

  it('reports unhealthy when the database is down, while still reporting every check', async () => {
    dependencyHealth.checkDatabase.mockResolvedValue({
      status: 'down',
      error: 'connection refused',
    });

    const result = await useCase.execute();

    expect(result.status).toBe('unhealthy');
    expect(result.database).toEqual({
      status: 'down',
      error: 'connection refused',
    });
    expect(result.redis).toEqual({ status: 'up' });
    expect(result.s3).toEqual({ status: 'up' });
  });

  it('reports unhealthy when redis is down', async () => {
    dependencyHealth.checkRedis.mockResolvedValue({
      status: 'down',
      error: 'ECONNREFUSED',
    });
    const result = await useCase.execute();
    expect(result.status).toBe('unhealthy');
  });

  it('reports unhealthy when S3 is down', async () => {
    dependencyHealth.checkS3.mockResolvedValue({
      status: 'down',
      error: 'access denied',
    });
    const result = await useCase.execute();
    expect(result.status).toBe('unhealthy');
  });
});
