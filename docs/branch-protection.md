# Branch protection recommendation

This documents the GitHub repository settings recommended for `main` before this project reaches
General Availability (Milestone 15's acceptance criterion: "CI fails on any lint/type/test
regression... required status checks before merge"). **Applying these is your action** — a
repository setting change, not something committable in a workflow file.

## Where

GitHub repo → **Settings → Branches → Branch protection rules → Add rule** (pattern: `main`).

## Recommended settings

- **Require a pull request before merging** — no direct pushes to `main`, including by admins
  (uncheck "Allow specified actors to bypass required pull requests" unless you have a specific
  break-glass need).
  - Require at least 1 approval.
  - Dismiss stale approvals when new commits are pushed.
- **Require status checks to pass before merging**, and require branches to be up to date first.
  Select these checks (they only appear in the picker after the workflow has run at least once
  on a PR):
  - `ci` — lint, typecheck, dependency audit, migration-drift check, unit + integration tests,
    build, OpenAPI/SDK contract check.
  - `playwright` — only if you've configured the `E2E_CLERK_*` repository secrets (see
    `apps/web/e2e/README.md`); GitHub lets you require a check that sometimes doesn't run, but
    a job that's conditionally skipped still reports as skipped rather than pending, so this is
    safe to require either way.
- **Require conversation resolution before merging.**
- **Require signed commits** — optional; enable if the team already signs commits, don't
  introduce it as a surprise blocker if they don't.
- **Do not allow bypassing the above settings** — keep this on, including for repository admins,
  once the team is comfortable; it's the setting that actually makes the other rules mean
  something.
- **Restrict who can push to matching branches** — leave open to your team/org as appropriate;
  not a blocker, just worth deciding deliberately rather than leaving at the GitHub default.

## Required repository secrets

`ci` runs today with a placeholder Clerk key (it doesn't need a real one — Clerk auth is mocked at
the module level in every e2e spec, see `.github/workflows/ci.yml`'s top-level `env:` block and
`docs/ci-cd.md`). Add these under **Settings → Secrets and variables → Actions** before the
corresponding CI capability is real rather than a documented no-op or a hard failure:

| Secret | Used by | Notes |
|---|---|---|
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET` | `ci` job (required — the job fails fast with a clear message if these are unset) and `playwright` job | There is no S3 mock anywhere in this codebase, so the upload/download/version e2e specs (and Playwright's `drive.spec.ts`, which uploads a real file) do a real S3 round-trip against these. Without them, the `ci` job's "Verify AWS secrets are configured" step fails immediately, before wasting time on a cryptic deep-in-test AWS SDK error. See `docs/uploads.md`. |
| `E2E_CLERK_SECRET_KEY`, `E2E_CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_USER_EMAIL`, `E2E_CLERK_USER_PASSWORD` | `playwright` job (optional — the job self-skips, not fails, if unset) | Needs a real Clerk **test** instance (`sk_test_.../pk_test_...`) to actually sign anyone in — this repo's committed CI config deliberately can't include real credentials. See `apps/web/e2e/README.md`. |

## Why this matters now, not later

Milestone 15's acceptance criteria (`docs/testing-strategy.md`, `docs/ci-cd.md`) are only true in
practice once merges are actually gated on these checks passing — a CI workflow that runs but
isn't required doesn't stop a broken change from landing on `main`. This doc exists so that gap
is a visible, one-click-away TODO rather than an implicit assumption.
