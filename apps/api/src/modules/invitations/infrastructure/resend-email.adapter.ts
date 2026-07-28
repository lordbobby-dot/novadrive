import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '../../../config/env.validation';
import {
  EmailAdapter,
  SendInvitationEmailParams,
} from '../domain/email-adapter';

const RESEND_API_URL = 'https://api.resend.com/emails';

/** Real email delivery via Resend's HTTP API. Uses Node's built-in fetch rather than the `resend`
 * npm package — a single POST doesn't warrant an extra dependency. Selected by
 * EMAIL_PROVIDER=resend (see invitations.module.ts); env.validation.ts enforces that
 * RESEND_API_KEY/EMAIL_FROM are set whenever this adapter would be chosen, so both are
 * non-optional by the time this class is constructed. */
@Injectable()
export class ResendEmailAdapter implements EmailAdapter {
  private readonly logger = new Logger(ResendEmailAdapter.name);

  constructor(private readonly config: ConfigService<EnvConfig, true>) {}

  async sendInvitation(params: SendInvitationEmailParams): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.get('RESEND_API_KEY', { infer: true })}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.config.get('EMAIL_FROM', { infer: true }),
        to: params.to,
        subject: `${params.inviterName} invited you to "${params.resourceName}"`,
        html: renderInvitationHtml(params),
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Resend API returned ${response.status}: ${body}`);
      throw new Error(`Failed to send invitation email (${response.status})`);
    }
  }
}

function renderInvitationHtml(params: SendInvitationEmailParams): string {
  return `
    <p>${escapeHtml(params.inviterName)} invited you to collaborate on
    &ldquo;${escapeHtml(params.resourceName)}&rdquo; as <strong>${escapeHtml(params.role)}</strong>.</p>
    <p><a href="${escapeHtml(params.acceptUrl)}">Accept invitation</a></p>
  `.trim();
}

/** Interpolated into an HTML email body — inviterName/resourceName come from user-controlled
 * data (a display name, a file/folder name), so this isn't defense-in-depth, it's necessary. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
