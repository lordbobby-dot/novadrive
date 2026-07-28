import { ApiProperty } from '@nestjs/swagger';
import type { Notification } from '../../domain/notification.entity';

export class NotificationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  type!: string;

  @ApiProperty({ additionalProperties: true, type: 'object' })
  payload!: Record<string, unknown>;

  @ApiProperty({ nullable: true })
  readAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static fromDomain(notification: Notification): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = notification.id;
    dto.type = notification.type;
    dto.payload = notification.payload;
    dto.readAt = notification.readAt;
    dto.createdAt = notification.createdAt;
    return dto;
  }
}

export class NotificationPageResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items!: NotificationResponseDto[];

  @ApiProperty({ nullable: true })
  nextCursor!: string | null;
}

export class UnreadCountResponseDto {
  @ApiProperty()
  count!: number;
}

export class MarkAllReadResponseDto {
  @ApiProperty()
  count!: number;
}
