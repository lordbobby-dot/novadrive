import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { User } from '../../users/domain/user.entity';
import { GetUnreadCountUseCase } from '../application/get-unread-count.use-case';
import { ListNotificationsUseCase } from '../application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from '../application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from '../application/mark-notification-read.use-case';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  MarkAllReadResponseDto,
  NotificationPageResponseDto,
  NotificationResponseDto,
  UnreadCountResponseDto,
} from './dto/notification-response.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly getUnreadCount: GetUnreadCountUseCase,
    private readonly markNotificationRead: MarkNotificationReadUseCase,
    private readonly markAllNotificationsRead: MarkAllNotificationsReadUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: "The current user's notifications, newest first",
  })
  async list(
    @CurrentUser() user: User,
    @Query() query: NotificationQueryDto,
  ): Promise<NotificationPageResponseDto> {
    const page = await this.listNotifications.execute({
      recipientId: user.id,
      unreadOnly: query.unreadOnly,
      cursor: query.cursor,
      limit: query.limit ?? 20,
    });
    return {
      items: page.items.map((item) => NotificationResponseDto.fromDomain(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Count of unread notifications, for a bell badge' })
  async unreadCount(
    @CurrentUser() user: User,
  ): Promise<UnreadCountResponseDto> {
    const count = await this.getUnreadCount.execute(user.id);
    return { count };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  async markRead(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<NotificationResponseDto> {
    const notification = await this.markNotificationRead.execute({
      recipientId: user.id,
      notificationId: id,
    });
    return NotificationResponseDto.fromDomain(notification);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  async markAllRead(
    @CurrentUser() user: User,
  ): Promise<MarkAllReadResponseDto> {
    const count = await this.markAllNotificationsRead.execute(user.id);
    return { count };
  }
}
