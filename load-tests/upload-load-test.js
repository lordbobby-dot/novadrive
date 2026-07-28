import http from "k6/http";
import { check } from "k6";
import { Counter, Trend } from "k6/metrics";

/**
 * Load test for the full upload pipeline (initiate → upload part(s) to the presigned S3 URL →
 * report part → complete), driving the roadmap's example concurrency target (100 concurrent
 * uploads) end to end against a real backend and real S3 bucket. Each iteration uploads a small
 * (~64 KiB) single-part file — enough to exercise the whole state machine without generating a
 * meaningful S3 storage/bandwidth bill at the target VU count.
 *
 * WARNING: this creates real objects in the configured AWS_S3_BUCKET and real File/StorageObject
 * rows against whatever database BASE_URL points at. Do not run this against a production
 * environment. Each iteration's file is left in place (no cleanup use case exists for a
 * completed file outside Trash — see docs/testing-strategy.md) — run against a disposable
 * dev/staging dataset, and consider trashing/purging the created files afterward.
 *
 * Usage:
 *   API_TOKEN=<a real Clerk session bearer token> \
 *   FOLDER_ID=<a real folder id owned by that user> \
 *   BASE_URL=http://localhost:4000 \
 *   k6 run --vus 100 --iterations 100 load-tests/upload-load-test.js
 *
 * See load-tests/README.md for how to obtain API_TOKEN and FOLDER_ID.
 */

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const API_TOKEN = __ENV.API_TOKEN;
const FOLDER_ID = __ENV.FOLDER_ID;

if (!API_TOKEN || !FOLDER_ID) {
  throw new Error(
    "API_TOKEN and FOLDER_ID env vars are required — see load-tests/README.md.",
  );
}

const FILE_SIZE_BYTES = 64 * 1024;
// A fixed byte pattern, not random — keeps the checksum computation trivial and avoids k6
// spending CPU on crypto-quality randomness for throwaway load-test payloads.
const FILE_BODY = "x".repeat(FILE_SIZE_BYTES);

const uploadDuration = new Trend("upload_pipeline_duration_ms", true);
const uploadFailures = new Counter("upload_pipeline_failures");

const authHeaders = {
  Authorization: `Bearer ${API_TOKEN}`,
  "Content-Type": "application/json",
};

export const options = {
  thresholds: {
    upload_pipeline_duration_ms: ["p(95)<5000"],
    upload_pipeline_failures: ["count<1"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const start = Date.now();
  const fileName = `load-test-${__VU}-${__ITER}-${Date.now()}.txt`;

  const initiateRes = http.post(
    `${BASE_URL}/uploads/initiate`,
    JSON.stringify({
      name: fileName,
      folderId: FOLDER_ID,
      contentType: "text/plain",
      size: String(FILE_SIZE_BYTES),
    }),
    { headers: authHeaders },
  );
  if (!check(initiateRes, { "initiate: 201": (r) => r.status === 201 })) {
    uploadFailures.add(1);
    return;
  }
  const { uploadId, parts } = JSON.parse(initiateRes.body);

  const putRes = http.put(parts[0].url, FILE_BODY, {
    headers: { "Content-Type": "text/plain" },
  });
  if (!check(putRes, { "S3 PUT: 200": (r) => r.status === 200 })) {
    uploadFailures.add(1);
    return;
  }
  const eTag = (putRes.headers.ETag || putRes.headers.Etag || "").replaceAll('"', "");

  const reportRes = http.post(
    `${BASE_URL}/uploads/${uploadId}/parts`,
    JSON.stringify({ partNumber: 1, eTag, size: String(FILE_SIZE_BYTES) }),
    { headers: authHeaders },
  );
  if (!check(reportRes, { "report part: 204": (r) => r.status === 204 })) {
    uploadFailures.add(1);
    return;
  }

  const completeRes = http.post(
    `${BASE_URL}/uploads/${uploadId}/complete`,
    JSON.stringify({ folderId: FOLDER_ID, name: fileName }),
    { headers: authHeaders },
  );
  const completeOk = check(completeRes, {
    "complete: 201": (r) => r.status === 201,
  });
  if (!completeOk) uploadFailures.add(1);

  uploadDuration.add(Date.now() - start);
}
