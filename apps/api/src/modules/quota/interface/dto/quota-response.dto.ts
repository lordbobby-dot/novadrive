import { ApiProperty } from '@nestjs/swagger';
import { percentUsed } from '../../domain/storage-quota.entity';
import type { QuotaWithBreakdown } from '../../application/get-quota.use-case';

export class StorageBreakdownEntryDto {
  @ApiProperty()
  contentType!: string;

  @ApiProperty()
  totalBytes!: string;
}

export class QuotaResponseDto {
  @ApiProperty({ enum: ['USER', 'ORGANIZATION'] })
  subjectType!: string;

  @ApiProperty()
  subjectId!: string;

  @ApiProperty()
  limitBytes!: string;

  @ApiProperty()
  usedBytes!: string;

  @ApiProperty()
  percentUsed!: number;

  @ApiProperty({ type: [StorageBreakdownEntryDto] })
  breakdown!: StorageBreakdownEntryDto[];

  static fromDomain(result: QuotaWithBreakdown): QuotaResponseDto {
    const dto = new QuotaResponseDto();
    dto.subjectType = result.quota.subjectType;
    dto.subjectId = result.quota.subjectId;
    dto.limitBytes = result.quota.limitBytes;
    dto.usedBytes = result.quota.usedBytes;
    dto.percentUsed = percentUsed(result.quota);
    dto.breakdown = result.breakdown;
    return dto;
  }
}
