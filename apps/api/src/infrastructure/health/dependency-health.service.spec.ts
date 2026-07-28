import { ConfigService } from '@nestjs/config';
import { DependencyHealthService } from './dependency-health.service';
import type { EnvConfig } from '../../config/env.validation';
import type { PrismaService } from '../prisma/prisma.service';

describe('DependencyHealthService', () => {
  let prisma: { $queryRaw: jest.Mock };
  let s3: { send: jest.Mock };
  let config: ConfigService<EnvConfig, true>;
  let redisClient: { info: jest.Mock };
  let queue: { client: Promise<{ info: jest.Mock }> };
  let service: DependencyHealthService;

  beforeEach(() => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    s3 = { send: jest.fn().mockResolvedValue({}) };
    config = {
      get: jest.fn().mockReturnValue('novadrive-bucket'),
    } as unknown as ConfigService<EnvConfig, true>;
    redisClient = { info: jest.fn().mockResolvedValue('redis_version:7.0') };
    queue = { client: Promise.resolve(redisClient) };
    service = new DependencyHealthService(
      prisma as unknown as PrismaService,
      s3 as never,
      config,
      queue as never,
    );
  });

  it('reports the database up with a latency when the query succeeds', async () => {
    const result = await service.checkDatabase();
    expect(result.status).toBe('up');
    expect(result.latencyMs).toEqual(expect.any(Number));
  });

  it('reports the database down with the error message when the query throws', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const result = await service.checkDatabase();
    expect(result).toEqual({ status: 'down', error: 'connection refused' });
  });

  it('reports redis up when info() succeeds', async () => {
    const result = await service.checkRedis();
    expect(result.status).toBe('up');
  });

  it('reports redis down when info() throws', async () => {
    redisClient.info.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await service.checkRedis();
    expect(result).toEqual({ status: 'down', error: 'ECONNREFUSED' });
  });

  it('reports S3 up when HeadBucket succeeds', async () => {
    const result = await service.checkS3();
    expect(result.status).toBe('up');
  });

  it('reports S3 down with a clear message when AWS_S3_BUCKET is not configured', async () => {
    (config.get as jest.Mock).mockReturnValue(undefined);
    const result = await service.checkS3();
    expect(result).toEqual({
      status: 'down',
      error: 'AWS_S3_BUCKET is not configured',
    });
  });

  it('reports S3 down when the HeadBucket call throws', async () => {
    s3.send.mockRejectedValue(new Error('access denied'));
    const result = await service.checkS3();
    expect(result).toEqual({ status: 'down', error: 'access denied' });
  });
});
