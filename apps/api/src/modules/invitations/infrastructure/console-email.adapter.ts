import { Injectable, Logger } from '@nestjs/common';
import {
  EmailAdapter,
  SendInvitationEmailParams,
} from '../domain/email-adapter';

/** Dev/no-provider-configured implementation — logs what would have been sent instead of
 * actually sending it. Swap the binding in InvitationsModule for a real adapter (SES, Resend,
 * ...) when one is configured; nothing else in the app needs to change. */
@Injectable()
export class ConsoleEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(ConsoleEmailAdapter.name);

  async sendInvitation(params: SendInvitationEmailParams): Promise<void> {
    this.logger.log(
      `[invitation email] To: ${params.to} | ${params.inviterName} invited you as ${params.role} on "${params.resourceName}" | Accept: ${params.acceptUrl}`,
    );
    await Promise.resolve();
  }
}
