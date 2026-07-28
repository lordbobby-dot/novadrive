import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

/**
 * Load test for GET /search — the roadmap's explicit acceptance-criteria target from
 * docs/MILESTONE_5.md ("search stays under ~300ms on 50k+ rows") was never independently
 * load-tested. This closes that gap by driving sustained request-rate against the endpoint
 * and asserting p95 latency and error rate stay within budget.
 *
 * Usage:
 *   API_TOKEN=<a real Clerk session bearer token> \
 *   BASE_URL=http://localhost:4000 \
 *   k6 run load-tests/search-load-test.js
 *
 * See load-tests/README.md for how to obtain API_TOKEN and how to seed enough rows to make
 * the p95 assertion meaningful (the roadmap's target is against a 50k+ row dataset).
 */

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const API_TOKEN = __ENV.API_TOKEN;
const TARGET_RPS = Number(__ENV.TARGET_RPS || 500);

if (!API_TOKEN) {
  throw new Error(
    "API_TOKEN env var is required — see load-tests/README.md for how to obtain one.",
  );
}

const searchLatency = new Trend("search_latency_ms", true);

const QUERIES = [
  "report",
  "invoice",
  "photo",
  "design",
  "notes",
  "budget",
  "presentation",
  "contract",
];

export const options = {
  scenarios: {
    search_throughput: {
      executor: "constant-arrival-rate",
      rate: TARGET_RPS,
      timeUnit: "1s",
      duration: __ENV.DURATION || "30s",
      preAllocatedVUs: Math.max(50, Math.ceil(TARGET_RPS / 5)),
      maxVUs: Math.max(200, TARGET_RPS * 2),
    },
  },
  thresholds: {
    // The roadmap's own acceptance target: p95 under 300ms.
    search_latency_ms: ["p(95)<300"],
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];
  const res = http.get(`${BASE_URL}/search?q=${encodeURIComponent(q)}&limit=25`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });

  searchLatency.add(res.timings.duration);
  check(res, {
    "status is 200": (r) => r.status === 200,
    "has items array": (r) => {
      try {
        return Array.isArray(JSON.parse(r.body).items);
      } catch {
        return false;
      }
    },
  });
}
