import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export interface DailyCount {
  day: string;
  count: number;
}

export interface DailyStorage {
  day: string;
  cumulativeBytes: string;
}

export interface AdminAnalyticsResult {
  signupsByDay: DailyCount[];
  /** A running total of bytes uploaded (COMPLETED StorageObjects only), not a snapshot of bytes
   * currently stored — there's no historical snapshot table, so this is an approximation that
   * only grows and never reflects deletions. Documented, not silently assumed away. */
  storageGrowthByDay: DailyStorage[];
  /** Distinct actors with at least one Activity row in the window — "did something," not
   * "signed in," since Activity (not AuditLog's LOGIN events) is the broadest signal of use. */
  activeUserCount: number;
  totalUserCount: number;
  totalOrganizationCount: number;
  windowDays: number;
}

interface DayCountRow {
  day: Date;
  count: bigint;
}

interface DayBytesRow {
  day: Date;
  cumulativeBytes: string;
}

@Injectable()
export class GetAdminAnalyticsUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(windowDays: number): Promise<AdminAnalyticsResult> {
    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [
      signupRows,
      storageRows,
      activeUserRows,
      totalUserCount,
      totalOrganizationCount,
    ] = await Promise.all([
      this.prisma.$queryRaw<DayCountRow[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "User"
        WHERE "createdAt" >= ${since}
        GROUP BY day
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<DayBytesRow[]>`
        SELECT day, "cumulativeBytes" FROM (
          SELECT day, SUM(bytes) OVER (ORDER BY day)::text AS "cumulativeBytes"
          FROM (
            SELECT date_trunc('day', "createdAt") AS day, SUM(size) AS bytes
            FROM "StorageObject"
            WHERE "uploadStatus" = 'COMPLETED'
            GROUP BY day
          ) daily
        ) totals
        WHERE day >= ${since}
        ORDER BY day ASC
      `,
      this.prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(DISTINCT "actorId")::bigint AS count
        FROM "Activity"
        WHERE "createdAt" >= ${since}
      `,
      this.prisma.user.count(),
      this.prisma.organization.count(),
    ]);

    return {
      signupsByDay: signupRows.map((row) => ({
        day: toDayString(row.day),
        count: Number(row.count),
      })),
      storageGrowthByDay: storageRows.map((row) => ({
        day: toDayString(row.day),
        cumulativeBytes: row.cumulativeBytes,
      })),
      activeUserCount: Number(activeUserRows[0]?.count ?? 0),
      totalUserCount,
      totalOrganizationCount,
      windowDays,
    };
  }
}

function toDayString(day: Date): string {
  return day.toISOString().slice(0, 10);
}
