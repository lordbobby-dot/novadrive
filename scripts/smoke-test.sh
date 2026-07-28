#!/usr/bin/env bash
#
# Smoke test for a freshly deployed NovaDrive stack (docker-compose.prod.yml or equivalent).
# Exercises only unauthenticated, side-effect-free endpoints — this confirms the deployment
# itself is wired correctly (containers up, reachable, dependencies connected), not application
# correctness (that's what apps/api's test suite and apps/web's Playwright suite are for).
#
# Usage:
#   API_URL=https://api.example.com WEB_URL=https://app.example.com ./scripts/smoke-test.sh
#
# Defaults to http://localhost:4000 / http://localhost:3000 if unset (matches
# docker-compose.prod.yml's default host ports), for smoke-testing a local prod-mode run.
#
# See docs/smoke-test.md for what each check verifies and how to read a failure.

set -uo pipefail

API_URL="${API_URL:-http://localhost:4000}"
WEB_URL="${WEB_URL:-http://localhost:3000}"
API_URL="${API_URL%/}"
WEB_URL="${WEB_URL%/}"

pass_count=0
fail_count=0

# curl's own connection/timeout failures (exit code != 0) are reported as status 000, so a
# missing container and a wrong-status response both fail the same check without extra plumbing.
http_get() {
  curl --silent --show-error --max-time 10 --write-out '\n%{http_code}' "$1" 2>/dev/null || echo -e "\n000"
}

body_of() { echo "$1" | sed '$d'; }
status_of() { echo "$1" | tail -n 1; }

check() {
  local name="$1"
  local ok="$2"
  local detail="${3:-}"
  if [ "$ok" = "true" ]; then
    echo "PASS  $name"
    pass_count=$((pass_count + 1))
  else
    echo "FAIL  $name${detail:+ — $detail}"
    fail_count=$((fail_count + 1))
  fi
}

echo "Smoke-testing API_URL=$API_URL WEB_URL=$WEB_URL"
echo

# --- API: liveness ---
resp="$(http_get "$API_URL/health")"
status="$(status_of "$resp")"
body="$(body_of "$resp")"
if [ "$status" = "200" ] && echo "$body" | grep -q '"status":"ok"'; then
  check "GET /health (liveness)" true
else
  check "GET /health (liveness)" false "HTTP $status: $body"
fi

# --- API: readiness (Postgres + Redis + S3) ---
resp="$(http_get "$API_URL/health/ready")"
status="$(status_of "$resp")"
body="$(body_of "$resp")"
if [ "$status" = "200" ]; then
  check "GET /health/ready — overall" true
else
  check "GET /health/ready — overall" false "HTTP $status: $body"
fi
for dep in database redis s3; do
  if echo "$body" | grep -q "\"$dep\":{\"status\":\"up\""; then
    check "GET /health/ready — $dep up" true
  else
    check "GET /health/ready — $dep up" false "not reported up in: $body"
  fi
done

# --- API: metrics endpoint is exposed ---
resp="$(http_get "$API_URL/metrics")"
status="$(status_of "$resp")"
body="$(body_of "$resp")"
if [ "$status" = "200" ] && echo "$body" | grep -q "http_request_duration_seconds"; then
  check "GET /metrics" true
else
  check "GET /metrics" false "HTTP $status"
fi

# --- Web: home page renders ---
resp="$(http_get "$WEB_URL/")"
status="$(status_of "$resp")"
body="$(body_of "$resp")"
if [ "$status" = "200" ] && echo "$body" | grep -qi "novadrive"; then
  check "GET / (web home page)" true
else
  check "GET / (web home page)" false "HTTP $status"
fi

# --- Web: sign-in page renders (confirms Clerk publishable key was baked in correctly) ---
resp="$(http_get "$WEB_URL/sign-in")"
status="$(status_of "$resp")"
if [ "$status" = "200" ]; then
  check "GET /sign-in (web)" true
else
  check "GET /sign-in (web)" false "HTTP $status"
fi

echo
echo "$pass_count passed, $fail_count failed"
[ "$fail_count" -eq 0 ]
