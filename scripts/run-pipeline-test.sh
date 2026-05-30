#!/usr/bin/env bash
#
# Real-World Pipeline Test Runner
#
# Triggers the full Outreach AI pipeline verification against a live university.
# Requires the dev server to be running on localhost:3001.
#
# Usage:
#   ./scripts/run-pipeline-test.sh "Anna University" "Tamil Nadu"
#   ./scripts/run-pipeline-test.sh "Birla Institute of Technology and Science" "Rajasthan" "https://www.bits-pilani.ac.in"
#

set -euo pipefail

UNI_NAME="${1:-Anna University}"
STATE="${2:-Tamil Nadu}"
WEBSITE="${3:-}"
HOST="${CONVEX_HOST:-http://localhost:3001}"
SECRET="${TEST_WEBHOOK_SECRET:-}"

# Build JSON payload
PAYLOAD=$(jq -n \
  --arg name "$UNI_NAME" \
  --arg state "$STATE" \
  --arg website "$WEBSITE" \
  '{
    universityName: $name,
    state: $state,
    website: (if $website == "" then null else $website end),
    stages: [
      "ingestion",
      "discovery",
      "scraper",
      "enrichment",
      "deep_enrichment",
      "scoring",
      "outreach",
      "reply",
      "proposal"
    ]
  }')

echo "🚀 Running real-world pipeline test..."
echo "   University: $UNI_NAME"
echo "   State:      $STATE"
echo "   Endpoint:   $HOST/api/test/run-pipeline"
echo ""

AUTH_HEADER=""
if [ -n "$SECRET" ]; then
  AUTH_HEADER="Authorization: Bearer $SECRET"
fi

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$HOST/api/test/run-pipeline" \
  -H "Content-Type: application/json" \
  ${AUTH_HEADER:+-H "$AUTH_HEADER"} \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo "HTTP Status: $HTTP_CODE"
echo ""

if [ "$HTTP_CODE" = "200" ]; then
  echo "$BODY" | jq .
  echo ""
  SUCCESS=$(echo "$BODY" | jq -r '.success')
  if [ "$SUCCESS" = "true" ]; then
    echo "✅ Pipeline test PASSED"
  else
    echo "❌ Pipeline test FAILED"
    exit 1
  fi
else
  echo "❌ Request failed with HTTP $HTTP_CODE"
  echo "$BODY"
  exit 1
fi
