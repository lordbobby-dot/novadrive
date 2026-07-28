import { defineConfig, devices } from "@playwright/test";
import path from "path";

const PORT = process.env.PORT || 3000;
const baseURL = `http://localhost:${PORT}`;

/** Full E2E regression suite (Milestone 15, later extended) covering acceptance criteria across
 * milestones — auth gating (M1), Drive navigation/folder CRUD (M2), upload (M3), search (M5),
 * trash (M6), public share links incl. folder browsing (M7 + post-M16), favorites (M12), and the
 * command palette (M12) — against a real running app and real Clerk test-mode auth. See
 * docs/testing-strategy.md and e2e/README.md for how auth is provisioned. */
export default defineConfig({
  testDir: path.join(__dirname, "e2e"),
  outputDir: "test-results/",
  fullyParallel: false,
  // All authenticated tests share one Clerk test user's session against one real backend —
  // serial execution keeps its Drive contents deterministic across specs (e.g. the trash and
  // search tests both create/find folders by name).
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command: "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL,
    trace: "retry-with-trace",
  },
  projects: [
    {
      name: "global setup",
      testMatch: /global\.setup\.ts/,
      teardown: "global teardown",
    },
    {
      name: "global teardown",
      testMatch: /global\.teardown\.ts/,
    },
    {
      name: "unauthenticated",
      testMatch: /unauthenticated\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["global setup"],
    },
    {
      name: "authenticated",
      testMatch: /.*\.spec\.ts/,
      testIgnore: /unauthenticated\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.clerk/user.json",
      },
      dependencies: ["global setup"],
    },
  ],
});
