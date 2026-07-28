import { GetAdminAnalyticsUseCase } from './get-admin-analytics.use-case';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service';

describe('GetAdminAnalyticsUseCase', () => {
  let prisma: {
    $queryRaw: jest.Mock;
    user: { count: jest.Mock };
    organization: { count: jest.Mock };
  };
  let useCase: GetAdminAnalyticsUseCase;

  beforeEach(() => {
    prisma = {
      $queryRaw: jest.fn(),
      user: { count: jest.fn() },
      organization: { count: jest.fn() },
    };
    useCase = new GetAdminAnalyticsUseCase(prisma as unknown as PrismaService);
  });

  it('maps signups/storage-growth rows to day strings and numbers, and defaults activeUserCount when the query returns no rows', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([
        { day: new Date('2026-01-01T00:00:00Z'), count: 3n },
      ])
      .mockResolvedValueOnce([
        { day: new Date('2026-01-01T00:00:00Z'), cumulativeBytes: '1024' },
      ])
      .mockResolvedValueOnce([]); // no active-user row at all
    prisma.user.count.mockResolvedValue(42);
    prisma.organization.count.mockResolvedValue(5);

    const result = await useCase.execute(30);

    expect(result).toEqual({
      signupsByDay: [{ day: '2026-01-01', count: 3 }],
      storageGrowthByDay: [{ day: '2026-01-01', cumulativeBytes: '1024' }],
      activeUserCount: 0,
      totalUserCount: 42,
      totalOrganizationCount: 5,
      windowDays: 30,
    });
  });

  it('reads activeUserCount from the single aggregate row when present', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 17n }]);
    prisma.user.count.mockResolvedValue(0);
    prisma.organization.count.mockResolvedValue(0);

    const result = await useCase.execute(7);

    expect(result.activeUserCount).toBe(17);
    expect(result.windowDays).toBe(7);
  });
});
