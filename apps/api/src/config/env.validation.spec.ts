import { validateEnv } from './env.validation';

function baseEnv(
  overrides: Record<string, string> = {},
): Record<string, string> {
  return {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    CLERK_SECRET_KEY: 'sk_test_abc',
    CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_abc',
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('defaults EMAIL_PROVIDER to console, requiring no email config', () => {
    const config = validateEnv(baseEnv());
    expect(config.EMAIL_PROVIDER).toBe('console');
  });

  it('accepts EMAIL_PROVIDER=resend when RESEND_API_KEY and EMAIL_FROM are both set', () => {
    const config = validateEnv(
      baseEnv({
        EMAIL_PROVIDER: 'resend',
        RESEND_API_KEY: 're_live_abc',
        EMAIL_FROM: 'NovaDrive <noreply@novadrive.io>',
      }),
    );
    expect(config.EMAIL_PROVIDER).toBe('resend');
    expect(config.RESEND_API_KEY).toBe('re_live_abc');
  });

  it('rejects EMAIL_PROVIDER=resend without RESEND_API_KEY', () => {
    expect(() =>
      validateEnv(
        baseEnv({
          EMAIL_PROVIDER: 'resend',
          EMAIL_FROM: 'noreply@novadrive.io',
        }),
      ),
    ).toThrow(/RESEND_API_KEY is required/);
  });

  it('rejects EMAIL_PROVIDER=resend without EMAIL_FROM', () => {
    expect(() =>
      validateEnv(
        baseEnv({ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 're_live_abc' }),
      ),
    ).toThrow(/EMAIL_FROM is required/);
  });
});
