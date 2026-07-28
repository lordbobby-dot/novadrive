import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FoldersModule } from '../folders/folders.module';
import { FilesModule } from '../files/files.module';
import { UsersModule } from '../users/users.module';
import { SharingModule } from '../sharing/sharing.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import type { EnvConfig } from '../../config/env.validation';
import { INVITATION_REPOSITORY } from './domain/invitation.repository';
import { PrismaInvitationRepository } from './infrastructure/prisma-invitation.repository';
import { EMAIL_ADAPTER, EmailAdapter } from './domain/email-adapter';
import { ConsoleEmailAdapter } from './infrastructure/console-email.adapter';
import { ResendEmailAdapter } from './infrastructure/resend-email.adapter';
import { CreateInvitationUseCase } from './application/create-invitation.use-case';
import { AcceptInvitationUseCase } from './application/accept-invitation.use-case';
import { ListInvitationsForResourceUseCase } from './application/list-invitations-for-resource.use-case';
import { RevokeInvitationUseCase } from './application/revoke-invitation.use-case';
import { InvitationsController } from './interface/invitations.controller';

@Module({
  imports: [
    FoldersModule,
    FilesModule,
    UsersModule,
    SharingModule,
    OrganizationsModule,
  ],
  controllers: [InvitationsController],
  providers: [
    { provide: INVITATION_REPOSITORY, useClass: PrismaInvitationRepository },
    {
      provide: EMAIL_ADAPTER,
      useFactory: (config: ConfigService<EnvConfig, true>): EmailAdapter =>
        config.get('EMAIL_PROVIDER', { infer: true }) === 'resend'
          ? new ResendEmailAdapter(config)
          : new ConsoleEmailAdapter(),
      inject: [ConfigService],
    },
    CreateInvitationUseCase,
    AcceptInvitationUseCase,
    ListInvitationsForResourceUseCase,
    RevokeInvitationUseCase,
  ],
})
export class InvitationsModule {}
