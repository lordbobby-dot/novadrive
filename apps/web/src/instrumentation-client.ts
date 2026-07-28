import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    // Enables the BrowserTracing integration, which auto-captures pageload/navigation spans
    // and Core Web Vitals (LCP/CLS/INP/FCP/TTFB) as span measurements — no manual reporting code.
    tracesSampleRate: 1.0,
  });
  console.log("[sentry] client error monitoring initialized");
} else {
  console.log("[sentry] NEXT_PUBLIC_SENTRY_DSN not set — client error monitoring disabled");
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
