import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import { AppConfigModule } from './config/app-config.module';
import type { EnvConfig } from './config/env.validation';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { QueueModule } from './infrastructure/queue/bull.module';
import { DomainEventsModule } from './infrastructure/events/domain-events.module';
import { LoggerModule } from './infrastructure/logging/logger.module';
import { MetricsModule } from './infrastructure/metrics/metrics.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FoldersModule } from './modules/folders/folders.module';
import { FilesModule } from './modules/files/files.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { QuotaModule } from './modules/quota/quota.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { DownloadsModule } from './modules/downloads/downloads.module';
import { DriveOperationsModule } from './modules/drive-operations/drive-operations.module';
import { TagsModule } from './modules/tags/tags.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { SearchModule } from './modules/search/search.module';
import { VersionsModule } from './modules/versions/versions.module';
import { TrashModule } from './modules/trash/trash.module';
import { ActivityModule } from './modules/activity/activity.module';
import { SharingModule } from './modules/sharing/sharing.module';
import { InvitationsModule } from './modules/invitations/invitations.module';
import { CommentsModule } from './modules/comments/comments.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    // Must be one of the first modules registered — see @sentry/nestjs's setup requirements.
    // A no-op wrapper when SENTRY_DSN is unset (Sentry.init() in instrument.ts was never called),
    // not an error.
    SentryModule.forRoot(),
    LoggerModule,
    MetricsModule,
    // Single named profile applied globally by the ThrottlerGuard below. A handful of public,
    // unauthenticated endpoints that a password/token brute-force could target (shared-link
    // password entry, invitation-token acceptance) tighten this per-route via
    // @Throttle({ default: { limit: ..., ttl: ... } }) rather than adding a second
    // module-level profile — every extra named profile in forRoot() applies to *every* route by
    // default, so a second always-on profile would throttle the whole API down to its limit,
    // not just the routes meant to be stricter. See docs/security.md.
    // Disabled under NODE_ENV=test: e2e specs fire many rapid requests at the same throttled
    // routes (from the same test-runner IP) well within a real client's normal usage — real-world
    // rate limiting isn't something tests should have to work around, and skipping it here
    // doesn't weaken it in an actual deployment.
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvConfig, true>) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    AppConfigModule,
    PrismaModule,
    QueueModule,
    DomainEventsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    FoldersModule,
    FilesModule,
    OrganizationsModule,
    SharingModule,
    QuotaModule,
    UploadsModule,
    DownloadsModule,
    DriveOperationsModule,
    TagsModule,
    FavoritesModule,
    SearchModule,
    VersionsModule,
    TrashModule,
    ActivityModule,
    InvitationsModule,
    CommentsModule,
    RealtimeModule,
    NotificationsModule,
    AuditModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Registered before any other exception filter, per @sentry/nestjs's setup docs — reports
    // every otherwise-unhandled exception. A no-op (never actually reports) when SENTRY_DSN is
    // unset, same as SentryModule.forRoot() above.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
