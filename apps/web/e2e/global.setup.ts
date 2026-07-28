import fs from "fs";
import path from "path";
import { createClerkClient } from "@clerk/backend";
import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test as setup } from "@playwright/test";

/**
 * Provisions a dedicated Playwright test user via the Clerk Backend API rather than requiring a
 * pre-existing account's credentials — the `+clerk_test` email convention Clerk recognizes in
 * test-mode instances skips real email verification, so this can run fully unattended. See
 * e2e/README.md for the required env vars and why this pattern (not a shared human test account)
 * was chosen.
 */
setup.describe.configure({ mode: "serial" });

const userStateFile = path.join(__dirname, ".clerk", "test-user.json");

setup("global setup", async () => {
  await clerkSetup();

  if (!process.env.E2E_CLERK_USER_EMAIL || !process.env.E2E_CLERK_USER_PASSWORD) {
    throw new Error(
      "Please provide E2E_CLERK_USER_EMAIL (must contain +clerk_test, e.g. " +
        "playwright+clerk_test@example.com) and E2E_CLERK_USER_PASSWORD — see e2e/README.md.",
    );
  }
  if (!process.env.E2E_CLERK_USER_EMAIL.includes("+clerk_test")) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL must use the +clerk_test convention so Clerk's test instance skips " +
        "real email verification (see https://clerk.com/docs/guides/development/testing/overview).",
    );
  }

  // A fresh email per run, not the literal env var — see e2e/README.md's "orphaned local rows"
  // note. NovaDrive syncs Clerk users into a local Postgres `User` row on every authenticated
  // request (SyncClerkUserUseCase), keyed unique on email; this repo has no webhook tunnel
  // reachable from Clerk in local/CI runs, so deleting the Clerk-side user in teardown can't
  // clean up that local row too. Reusing the same email across runs would collide with a
  // previous run's now-orphaned row (`Unique constraint failed on the fields: (email)`) — this
  // was hit and confirmed via the API's own error logs before switching to a per-run email.
  const runEmail = process.env.E2E_CLERK_USER_EMAIL.replace("@", `+${Date.now()}@`);

  const client = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });

  const created = await client.users.createUser({
    emailAddress: [runEmail],
    password: process.env.E2E_CLERK_USER_PASSWORD,
    firstName: "Playwright",
    lastName: "Test",
  });

  fs.mkdirSync(path.dirname(userStateFile), { recursive: true });
  fs.writeFileSync(userStateFile, JSON.stringify({ userId: created.id, email: runEmail }));
});

const authFile = path.join(__dirname, ".clerk", "user.json");

setup("authenticate", async ({ page }) => {
  const { email } = JSON.parse(fs.readFileSync(userStateFile, "utf-8")) as { email: string };

  await setupClerkTestingToken({ page });
  await page.goto("/");
  // `emailAddress`-only sign-in creates a short-lived backend sign-in ticket (via
  // CLERK_SECRET_KEY) and completes it programmatically — no password needed for this step, and
  // unlike the `signInParams` form it waits for `window.Clerk.user` to actually be set before
  // returning, so the following navigation isn't racing an in-flight sign-in.
  await clerk.signIn({ page, emailAddress: email });
  await page.goto("/dashboard");
  await page.waitForSelector("h1:has-text('Dashboard')");
  await page.context().storageState({ path: authFile });
});
