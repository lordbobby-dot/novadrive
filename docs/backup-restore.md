# Database Backup & Restore

[`scripts/backup-db.sh`](../scripts/backup-db.sh) and [`scripts/restore-db.sh`](../scripts/restore-db.sh)
back up and restore the Postgres database behind `docker-compose.prod.yml`'s self-hosted `postgres`
service (see that file's own comment: it's a *reference* deployment — a real production deployment
is expected to point `DATABASE_URL` at a managed Postgres instead, per "Managed vs. self-hosted"
below). Both scripts operate through `docker compose exec`, since `postgres` has no host port
mapping in that file.

## Backing up

```bash
./scripts/backup-db.sh                    # writes ./backups/novadrive-<UTC timestamp>.dump
BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh
```

Runs `pg_dump -Fc` (Postgres's custom archive format) inside the running `postgres` container.
Custom format was chosen over a plain `.sql` dump because it's compressed and lets `pg_restore`
select individual tables or run in parallel, without giving up the ability to restore the whole
database at once. `backups/` is gitignored — dumps contain real user data and are never committed.

Requires the stack to already be running (`docker compose -f docker-compose.prod.yml --env-file
.env.prod up -d postgres` at minimum); the script exits with an error and the exact command to run
if `postgres` isn't up.

## Restoring

```bash
./scripts/restore-db.sh ./backups/novadrive-20260115T030000Z.dump
./scripts/restore-db.sh --yes ./backups/novadrive-20260115T030000Z.dump   # skip the confirmation prompt
```

**Destructive** — `pg_restore --clean --if-exists` drops every existing object in the target
database before restoring, so anything created after the dump was taken is gone afterward. The
script:

1. Confirms `postgres` is running.
2. Warns (but doesn't block) if `api`/`worker`/`web` are still running — they'll keep writing to
   the database mid-restore otherwise. Stop them first: `docker compose -f docker-compose.prod.yml
   stop api worker web`.
3. Prompts for an explicit `yes` before touching anything, unless `--yes` was passed (for scripted/
   CI use — e.g. restoring into a fresh staging environment as part of a drill, see below).
4. Runs `pg_restore --clean --if-exists --no-owner` inside the `postgres` container. `--no-owner`
   avoids failures from the dump's original role not existing in the target (e.g. restoring a prod
   dump into a staging stack with a different `POSTGRES_USER`).

After a restore, bring `api`/`worker`/`web` back up. There's no migration step needed if the dump
came from the same schema version being restored into — the dump *is* the schema, not just data.
If you're restoring an older dump onto a newer codebase (e.g. disaster recovery weeks after a
schema change shipped), run `docker compose -f docker-compose.prod.yml up migrate` afterward so
`prisma migrate deploy` brings the restored schema forward to what the current `api` image expects.

## What backup-db.sh does *not* cover

- **S3 file contents.** Postgres holds metadata (`File`, `StorageObject`, folder structure,
  permissions, ...) — the actual file bytes live in S3, entirely separate from this backup. S3
  versioning/cross-region replication on the bucket itself is the right tool for that, not
  something these scripts touch.
- **Redis.** Holds only BullMQ queue state and ephemeral Socket.io session bookkeeping — nothing
  that needs durable backup; a lost Redis instance loses in-flight jobs (which the abandoned-upload
  cleanup job and BullMQ's own retry semantics already tolerate) and connected sockets reconnect on
  their own.

## Recommended automation

Neither script schedules itself — wire one into whatever the deployment host already uses for
cron-like scheduling. A minimal host crontab entry:

```cron
0 3 * * * cd /path/to/novadrive && BACKUP_DIR=/mnt/backups ./scripts/backup-db.sh >> /var/log/novadrive-backup.log 2>&1
```

For anything beyond a single reference host, ship `backups/` off-host after each run — a local-disk
backup doesn't survive the host itself failing. Since this project already provisions AWS
credentials for S3 (see [`docs/aws-setup.md`](aws-setup.md)), syncing to a separate S3 bucket (or a
separate prefix in the existing one, with a bucket policy that denies the API's own IAM user delete
access to it) is the natural choice:

```bash
./scripts/backup-db.sh && aws s3 cp ./backups/novadrive-*.dump s3://your-backup-bucket/novadrive/ --sse AES256
```

**Retention:** delete local dumps older than a few days (the off-host copy is the durable one) —
e.g. `find ./backups -name '*.dump' -mtime +7 -delete` after a successful upload. This project
doesn't prescribe a specific retention window; pick one based on how far back a plausible "we didn't
notice the corruption/bad deploy until now" window is for your deployment.

**Restore drills:** a backup you've never restored is unverified. Periodically run
`./scripts/restore-db.sh --yes <dump>` against a disposable Postgres container (not the live stack)
and spot-check row counts/a few known records — exactly how this feature was verified during
development (see the git history for this file).

## Managed vs. self-hosted

`docker-compose.prod.yml`'s own top comment already says the containerized `postgres` service is a
reference deployment, not a production recommendation — the real recommendation is a managed
Postgres (RDS, Cloud SQL, etc.) with its own automated, point-in-time-recovery-capable backup
system, at which point these scripts become unnecessary (unplug `postgres`/`pg_dump` from the
picture; `DATABASE_URL` just points elsewhere, per that same comment). Keep these scripts for local
development, staging, or a genuinely self-hosted single-host deployment.
