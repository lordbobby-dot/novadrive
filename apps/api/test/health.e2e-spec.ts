import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DependencyHealthService } from '../src/infrastructure/health/dependency-health.service';
import { S3_CLIENT } from '../src/modules/storage/infrastructure/s3-client.provider';
import { ChecksumVerificationProcessor } from '../src/modules/uploads/infrastructure/checksum-verification.processor';
import type { S3Client } from '@aws-sdk/client-s3';

interface ReadinessBody {
  status: 'ok' | 'unhealthy';
  database: { status: string };
  redis: { status: string };
  s3: { status: string };
}

describe('Health (e2e): liveness + readiness against real/overridden dependencies', () => {
  let app: INestApplication<App>;
  let dependencyHealth: jest.Mocked<DependencyHealthService>;

  beforeAll(async () => {
    dependencyHealth = {
      checkDatabase: jest
        .fn()
        .mockResolvedValue({ status: 'up', latencyMs: 1 }),
      checkRedis: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
      checkS3: jest.fn().mockResolvedValue({ status: 'up', latencyMs: 1 }),
    } as unknown as jest.Mocked<DependencyHealthService>;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DependencyHealthService)
      .useValue(dependencyHealth)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app.get(ChecksumVerificationProcessor).worker.close();
    app.get<S3Client>(S3_CLIENT).destroy();
    await app.close();
  });

  it('GET /health reports liveness without touching any dependency', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect((res.body as { status: string }).status).toBe('ok');
    expect(dependencyHealth.checkDatabase).not.toHaveBeenCalled();
  });

  it('GET /health/ready returns 200 when every dependency is up', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    const body = res.body as ReadinessBody;
    expect(body.status).toBe('ok');
    expect(body.database.status).toBe('up');
    expect(body.redis.status).toBe('up');
    expect(body.s3.status).toBe('up');
  });

  it('GET /health/ready returns 503 and reports which dependency is down when the database is unreachable', async () => {
    dependencyHealth.checkDatabase.mockResolvedValueOnce({
      status: 'down',
      error: 'connection refused',
    });

    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    const body = res.body as ReadinessBody;
    expect(body.status).toBe('unhealthy');
    expect(body.database).toEqual({
      status: 'down',
      error: 'connection refused',
    });
    expect(body.redis.status).toBe('up');
    expect(body.s3.status).toBe('up');
  });

  it('GET /health/ready returns 503 when redis is unreachable, independent of the other checks', async () => {
    dependencyHealth.checkRedis.mockResolvedValueOnce({
      status: 'down',
      error: 'ECONNREFUSED',
    });

    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect((res.body as ReadinessBody).status).toBe('unhealthy');
  });
});
