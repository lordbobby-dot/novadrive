import {
  BadRequestException,
  Controller,
  Inject,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SkipThrottle } from '@nestjs/throttler';
import { verifyWebhook } from '@clerk/backend/webhooks';
import type { Request as ExpressRequest } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import type { EnvConfig } from '../../../config/env.validation';
import { AUDIT_EVENT, AuditEvent } from '../../../common/events/audit.event';
import {
  USER_REPOSITORY,
  type UserRepository,
} from '../../users/domain/user.repository';
import { SyncClerkUserUseCase } from '../../users/application/sync-clerk-user.use-case';
import { DeleteClerkUserUseCase } from '../../users/application/delete-clerk-user.use-case';

@ApiExcludeController()
@Public()
// Authenticated via HMAC signature, not user identity — a legitimate burst of Clerk events
// (e.g. a bulk user import) shouldn't get IP-rate-limited the way user-facing traffic should.
@SkipThrottle()
@Controller('webhooks/clerk')
export class ClerkWebhookController {
  private readonly logger = new Logger(ClerkWebhookController.name);

  constructor(
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly syncClerkUser: SyncClerkUserUseCase,
    private readonly deleteClerkUser: DeleteClerkUserUseCase,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly events: EventEmitter2,
  ) {}

  @Post()
  async handle(@Req() req: RawBodyRequest<ExpressRequest>) {
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    const request = new Request(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      {
        method: 'POST',
        headers: new Headers(req.headers as Record<string, string>),
        body: Uint8Array.from(req.rawBody),
      },
    );

    const event = await verifyWebhook(request, {
      signingSecret: this.config.get('CLERK_WEBHOOK_SIGNING_SECRET', {
        infer: true,
      }),
    }).catch((error: unknown) => {
      this.logger.warn(
        `Clerk webhook signature verification failed: ${String(error)}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    });

    switch (event.type) {
      case 'user.created':
      case 'user.updated': {
        const primaryEmail = event.data.email_addresses.find(
          (email) => email.id === event.data.primary_email_address_id,
        )?.email_address;
        if (!primaryEmail) {
          this.logger.warn(
            `Clerk ${event.type} event for ${event.data.id} has no primary email`,
          );
          break;
        }
        await this.syncClerkUser.execute({
          clerkId: event.data.id,
          email: primaryEmail,
          name:
            [event.data.first_name, event.data.last_name]
              .filter(Boolean)
              .join(' ') || null,
          avatarUrl: event.data.image_url || null,
        });
        break;
      }
      case 'user.deleted': {
        if (event.data.id) {
          await this.deleteClerkUser.execute(event.data.id);
        }
        break;
      }
      case 'session.created':
        await this.recordSessionAudit(event.data, 'LOGIN', 'SUCCESS');
        break;
      case 'session.ended':
        await this.recordSessionAudit(event.data, 'LOGOUT', 'SUCCESS');
        break;
      case 'session.revoked':
        await this.recordSessionAudit(event.data, 'SESSION_REVOKED', 'SUCCESS');
        break;
      default:
        break;
    }

    return { received: true };
  }

  /** `session.removed` (client-side cleanup, not a real sign-in/out) is deliberately not routed
   * here — see the switch above. */
  private async recordSessionAudit(
    session: {
      user_id: string;
      id: string;
      latest_activity?: {
        ip_address?: string;
        browser_name?: string;
        device_type?: string;
      };
    },
    eventType: 'LOGIN' | 'LOGOUT' | 'SESSION_REVOKED',
    outcome: 'SUCCESS' | 'FAILURE',
  ): Promise<void> {
    const actor = await this.users.findByClerkId(session.user_id);
    const activity = session.latest_activity;
    this.events.emit(
      AUDIT_EVENT,
      new AuditEvent(
        eventType,
        outcome,
        actor?.id ?? null,
        undefined,
        undefined,
        { clerkUserId: session.user_id, sessionId: session.id },
        activity?.ip_address,
        [activity?.browser_name, activity?.device_type]
          .filter(Boolean)
          .join(' ') || undefined,
      ),
    );
  }
}
