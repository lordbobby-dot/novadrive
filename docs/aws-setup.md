# AWS S3 Setup

NovaDrive stores every file's bytes in Amazon S3. Postgres only ever stores metadata
(bucket, key, checksum, size, ...) — never binary data. This doc covers the one-time AWS setup
needed before the upload pipeline (Milestone 3) can be built, and is also what you need locally
today since we use real AWS S3 in every environment, including local dev.

## 1. Create the bucket

1. In the AWS Console, go to **S3 → Create bucket**.
2. Name: `novadrive-<environment>` (e.g. `novadrive-dev`, `novadrive-prod`). Bucket names are
   globally unique, so you may need to adjust.
3. Region: pick one close to you/your users and note it — it goes in `AWS_REGION`.
4. Block all public access: **on** (NovaDrive serves files exclusively via signed URLs, never
   public bucket policies).
5. Bucket versioning: **on** — this gives us a safety net independent of our own `FileVersion`
   application-level versioning (Milestone 6).
6. Default encryption: **on**, SSE-S3 (`AES256`) is sufficient to start; SSE-KMS is a drop-in
   upgrade later if you need customer-managed keys (see the Encryption section of the roadmap).

## 2. CORS configuration

The browser uploads directly to S3 via presigned URLs (Milestone 3), so the bucket needs a CORS
policy allowing your web app's origin:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["http://localhost:3000"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Add your deployed frontend origin(s) to `AllowedOrigins` when you have them.

## 3. IAM user / role and least-privilege policy

Create an IAM user (local dev) or IAM role (if running on EC2/ECS/Lambda later) with only the
permissions NovaDrive's API actually needs — scoped to the one bucket:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "NovaDriveObjectAccess",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::novadrive-dev/*"
    },
    {
      "Sid": "NovaDriveBucketList",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::novadrive-dev"
    }
  ]
}
```

Generate an access key for this user and put it in `apps/api/.env`:

```
AWS_REGION=us-east-1
AWS_S3_BUCKET=novadrive-dev
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Never commit real credentials — `.env` is gitignored; only `.env.example` (with empty values)
is tracked.

## 4. What's not needed yet

- **Lifecycle rules** (e.g. moving old versions to Glacier) — revisit once real usage patterns
  exist, not before.
- **CloudFront** — only needed if/when we want CDN-fronted downloads or bandwidth throttling via
  signed cookies (noted as a design tradeoff in Milestone 4).
- **KMS customer-managed keys** — SSE-S3 is enough until the Encryption milestone work
  (per-file/envelope encryption) actually needs it.

The S3 adapter code itself (multipart upload orchestration, presigned URL generation) is built
in Milestone 3 — this doc only covers the AWS-side setup Milestone 0 depends on existing.
