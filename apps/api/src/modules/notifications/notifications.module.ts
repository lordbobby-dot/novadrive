import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { FoldersModule } from '../folders/folders.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { UsersModule } from '../users/users.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NOTIFICATION_REPOSITORY } from './domain/notification.repository';
import { NotificationEventListener } from './infrastructure/notification-event.listener';
import { QuotaNotificationListener } from './infrastructure/quota-notification.listener';
import { PrismaNotificationRepository } from './infrastructure/prisma-notification.repository';
import { GetUnreadCountUseCase } from './application/get-unread-count.use-case';
import { ListNotificationsUseCase } from './application/list-notifications.use-case';
import { MarkAllNotificationsReadUseCase } from './application/mark-all-notifications-read.use-case';
import { MarkNotificationReadUseCase } from './application/mark-notification-read.use-case';
import { NotificationsController } from './interface/notifications.controller';

@Module({
  imports: [
    FoldersModule,
    FilesModule,
    RealtimeModule,
    UsersModule,
    OrganizationsModule,
  ],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATION_REPOSITORY,
      useClass: PrismaNotificationRepository,
    },
    NotificationEventListener,
    QuotaNotificationListener,
    ListNotificationsUseCase,
    GetUnreadCountUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
  ],
})
export class NotificationsModule {}
