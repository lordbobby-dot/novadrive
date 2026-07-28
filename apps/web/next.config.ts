import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Produces .next/standalone — a self-contained server bundle with only the node_modules this
  // app's traced dependency graph actually needs, instead of shipping the whole workspace's
  // node_modules into the production image. See apps/web/Dockerfile and docs/deployment.md.
  output: "standalone",
};

export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  // Source-map upload is skipped when these are unset — same env-gated-optionality pattern used
  // everywhere else in this project (see apps/api/src/instrument.ts, tracing.ts).
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
