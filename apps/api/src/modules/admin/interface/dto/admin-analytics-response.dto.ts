import { ApiProperty } from '@nestjs/swagger';
import type { AdminAnalyticsResult } from '../../application/get-admin-analytics.use-case';

export class DailyCountDto {
  @ApiProperty()
  day!: string;

  @ApiProperty()
  count!: number;
}

export class DailyStorageDto {
  @ApiProperty()
  day!: string;

  @ApiProperty({ description: 'BigInt serialized as a string' })
  cumulativeBytes!: string;
}

export class AdminAnalyticsResponseDto {
  @ApiProperty({ type: [DailyCountDto] })
  signupsByDay!: DailyCountDto[];

  @ApiProperty({ type: [DailyStorageDto] })
  storageGrowthByDay!: DailyStorageDto[];

  @ApiProperty()
  activeUserCount!: number;

  @ApiProperty()
  totalUserCount!: number;

  @ApiProperty()
  totalOrganizationCount!: number;

  @ApiProperty()
  windowDays!: number;

  static fromDomain(result: AdminAnalyticsResult): AdminAnalyticsResponseDto {
    const dto = new AdminAnalyticsResponseDto();
    dto.signupsByDay = result.signupsByDay;
    dto.storageGrowthByDay = result.storageGrowthByDay;
    dto.activeUserCount = result.activeUserCount;
    dto.totalUserCount = result.totalUserCount;
    dto.totalOrganizationCount = result.totalOrganizationCount;
    dto.windowDays = result.windowDays;
    return dto;
  }
}
