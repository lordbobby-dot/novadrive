import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGIN: z.string().default('http://localhost:3000'),

    DATABASE_URL: z.string().url(),

    REDIS_HOST: z.string().default('localhost'),
    REDIS_PORT: z.coerce.number().int().positive().default(6379),

    CLAMAV_HOST: z.string().default('localhost'),
    CLAMAV_PORT: z.coerce.number().int().positive().default(3310),

    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().min(1),

    AWS_REGION: z.string().optional(),
    AWS_S3_BUCKET: z.string().optional(),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),

    /** How long a trashed item survives before the cleanup job permanently deletes it. Small in
     * test config so the auto-purge acceptance criterion can be verified without waiting days. */
    TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

    /** How long an AuditLog row survives before the purge job deletes it — see docs/security.md's
     * "Retention" section. 90 days was already the documented recommended policy before the job
     * existed; this just makes it real. */
    AUDIT_LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

    /** How long an upload session can sit in PENDING/UPLOADING before the cleanup job treats it as
     * abandoned (tab closed mid-upload, network dropped) and aborts it — releasing its quota
     * reservation and the S3 multipart upload the same way AbortUploadUseCase does for a
     * client-initiated cancel. See docs/quota.md. */
    ABANDONED_UPLOAD_STALE_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .default(24),

    /** Default StorageQuota.limitBytes for a subject that doesn't have a row yet — lazily created
     * on first upload attempt at whichever of these applies. No self-serve upgrade flow exists yet
     * (see docs/quota.md); raising a specific subject's limit is a direct DB/admin action. */
    DEFAULT_USER_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 1024 * 1024 * 1024), // 10 GiB
    DEFAULT_ORG_QUOTA_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(100 * 1024 * 1024 * 1024), // 100 GiB

    /** Comma-separated emails granted isSystemAdmin on every Clerk sync (create or update) — the
     * only way to bootstrap the first admin, since there's no self-serve path to become one.
     * Never revokes: an admin promoted later through the admin panel, whose email isn't in this
     * list, keeps their role on next sync (see SyncClerkUserUseCase). */
    ADMIN_BOOTSTRAP_EMAILS: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? '')
          .split(',')
          .map((email) => email.trim().toLowerCase())
          .filter(Boolean),
      ),

    /** pino log level — same env-driven-optionality pattern as everything else in this file. */
    LOG_LEVEL: z
      .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
      .default('info'),

    /** Base URL of an OTLP-compatible collector (e.g. `http://localhost:4318`) — traces export to
     * `${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`. Unset means tracing is never started at all (see
     * src/tracing.ts) rather than started against a default endpoint nothing is listening on. */
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    OTEL_SERVICE_NAME: z.string().default('novadrive-api'),

    /** Sentry DSN — unset means SentryModule is never initialized (see main.ts), not initialized
     * against an empty string (which the Sentry SDK would treat as misconfiguration, not "off"). */
    SENTRY_DSN: z.string().optional(),

    /** Selects which EmailAdapter implementation InvitationsModule binds (see
     * invitations.module.ts). 'console' (the default, and every environment before this) just logs
     * what would have been sent. 'resend' sends real email via the Resend API and requires
     * RESEND_API_KEY + EMAIL_FROM — enforced below so a misconfigured prod deploy fails at boot
     * rather than silently dropping invitation emails on first send. */
    EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: z.string().optional(),
    /** e.g. `"NovaDrive <noreply@yourdomain.com>"` — must be a sender identity verified with Resend. */
    EMAIL_FROM: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.EMAIL_PROVIDER !== 'resend') return;
    if (!data.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
    if (!data.EMAIL_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMAIL_FROM'],
        message: 'EMAIL_FROM is required when EMAIL_PROVIDER=resend',
      });
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

function emptyStringsToUndefined(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      value === '' ? undefined : value,
    ]),
  );
}

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(emptyStringsToUndefined(config));
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }
  return parsed.data;
}
