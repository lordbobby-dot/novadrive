import { ConfigService } from '@nestjs/config';
import { ResendEmailAdapter } from './resend-email.adapter';
import type { SendInvitationEmailParams } from '../domain/email-adapter';
import type { EnvConfig } from '../../../config/env.validation';

function makeConfig(
  overrides: Partial<Record<'RESEND_API_KEY' | 'EMAIL_FROM', string>> = {},
): ConfigService<EnvConfig, true> {
  const values: Record<string, string> = {
    RESEND_API_KEY: 're_test_key',
    EMAIL_FROM: 'NovaDrive <noreply@novadrive.test>',
    ...overrides,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<
    EnvConfig,
    true
  >;
}

function makeParams(
  overrides: Partial<SendInvitationEmailParams> = {},
): SendInvitationEmailParams {
  return {
    to: 'friend@example.com',
    inviterName: 'Ada Lovelace',
    resourceName: 'Q3 Roadmap',
    role: 'EDITOR',
    acceptUrl: 'https://app.example.com/invitations/tok_abc',
    ...overrides,
  };
}

function sentBody(fetchMock: jest.MockedFunction<typeof fetch>): {
  from: string;
  to: string;
  subject: string;
  html: string;
} {
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(init?.body as string) as {
    from: string;
    to: string;
    subject: string;
    html: string;
  };
}

describe('ResendEmailAdapter', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  it('POSTs to the Resend API with the configured key and from address', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Awaited<
      ReturnType<typeof fetch>
    >);
    const adapter = new ResendEmailAdapter(makeConfig());

    await adapter.sendInvitation(makeParams());

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
    });
    const body = sentBody(fetchMock);
    expect(body.from).toBe('NovaDrive <noreply@novadrive.test>');
    expect(body.to).toBe('friend@example.com');
    expect(body.subject).toBe('Ada Lovelace invited you to "Q3 Roadmap"');
    expect(body.html).toContain('Ada Lovelace');
    expect(body.html).toContain('Accept invitation');
  });

  it('escapes HTML in user-controlled fields to prevent injection into the email body', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Awaited<
      ReturnType<typeof fetch>
    >);
    const adapter = new ResendEmailAdapter(makeConfig());

    await adapter.sendInvitation(
      makeParams({
        inviterName: '<script>alert(1)</script>',
        resourceName: '"><img src=x>',
      }),
    );

    const body = sentBody(fetchMock);
    expect(body.html).not.toContain('<script>');
    expect(body.html).not.toContain('<img src=x>');
    expect(body.html).toContain('&lt;script&gt;');
  });

  it('throws when the Resend API responds with a non-2xx status', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"message":"invalid from address"}'),
    } as Awaited<ReturnType<typeof fetch>>);
    const adapter = new ResendEmailAdapter(makeConfig());

    await expect(adapter.sendInvitation(makeParams())).rejects.toThrow(
      'Failed to send invitation email (422)',
    );
  });
});
