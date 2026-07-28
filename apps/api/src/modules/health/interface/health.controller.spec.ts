import type { Response } from 'express';
import { HealthController } from './health.controller';
import type { GetReadinessUseCase } from '../../../infrastructure/health/get-readiness.use-case';

function makeResponse(): jest.Mocked<Response> {
  return {
    status: jest.fn().mockReturnThis(),
  } as unknown as jest.Mocked<Response>;
}

describe('HealthController', () => {
  let getReadiness: jest.Mocked<GetReadinessUseCase>;
  let controller: HealthController;

  beforeEach(() => {
    getReadiness = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetReadinessUseCase>;
    controller = new HealthController(getReadiness);
  });

  it('returns an ok status with a timestamp for the liveness check', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('returns 200 when every dependency is up', async () => {
    getReadiness.execute.mockResolvedValue({
      status: 'ok',
      database: { status: 'up' },
      redis: { status: 'up' },
      s3: { status: 'up' },
    });
    const res = makeResponse();

    const result = await controller.ready(res);

    expect(res.status).not.toHaveBeenCalled();
    expect(result.status).toBe('ok');
  });

  it('sets a 503 status when any dependency is down', async () => {
    getReadiness.execute.mockResolvedValue({
      status: 'unhealthy',
      database: { status: 'down', error: 'connection refused' },
      redis: { status: 'up' },
      s3: { status: 'up' },
    });
    const res = makeResponse();

    const result = await controller.ready(res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(result.status).toBe('unhealthy');
  });
});
