import type { Instrumentation } from "next";

/** Env-gated exactly like the API's Sentry/OTel setup (see apps/api/src/instrument.ts) — unset
 * NEXT_PUBLIC_SENTRY_DSN means Sentry never initializes server-side, rather than initializing
 * against an empty DSN the SDK would treat as misconfiguration. */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] NEXT_PUBLIC_SENTRY_DSN not set — server error monitoring disabled");
    return;
  }

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn, environment: process.env.NODE_ENV });
    console.log("[sentry] server error monitoring initialized (nodejs runtime)");
  } else if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({ dsn, environment: process.env.NODE_ENV });
    console.log("[sentry] server error monitoring initialized (edge runtime)");
  }
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.captureRequestError(...args);
};
