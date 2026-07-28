import { ApiProperty } from '@nestjs/swagger';
import type { Activity } from '../../domain/activity.entity';

export class ActivityResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  actorId!: string;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  targetType!: string;

  @ApiProperty({ nullable: true })
  targetId!: string | null;

  @ApiProperty({ nullable: true, additionalProperties: true, type: 'object' })
  metadata!: Record<string, unknown> | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(activity: Activity): ActivityResponseDto {
    const dto = new ActivityResponseDto();
    dto.id = activity.id;
    dto.actorId = activity.actorId;
    dto.action = activity.action;
    dto.targetType = activity.targetType;
    dto.targetId = activity.targetId;
    dto.metadata = activity.metadata;
    dto.createdAt = activity.createdAt;
    return dto;
  }
}

export class ActivityPageResponseDto {
  @ApiProperty({ type: [ActivityResponseDto] })
  items!: ActivityResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}
