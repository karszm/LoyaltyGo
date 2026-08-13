#!/usr/bin/env bash
# smoke.sh — real HTTP smoke tests against locally-served Edge Functions.
#
# Prereqs:
#   supabase start
#   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/seed.sql
#   supabase functions serve sdk-api --env-file supabase/functions/.env.local --no-verify-jwt &
#
# Usage: backend/supabase/tests/smoke.sh [sdk|public|panel]   (default: all sections)
#
# Structured as one function per surface (Task 5 = sdk; Tasks 6-7 add public/panel) so
# new sections can be appended without touching this one.

set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:54321/functions/v1}"
SDK_BASE="$BASE_URL/sdk-api"

KEY_A="test"               # plaintext program key, merchant A (seed.sql)
CARD_A="seed-card-a-001"
CARD_B="seed-card-b-001"   # belongs to merchant B — used for cross-tenant checks

PASS=0
FAIL=0

check() {
  local desc="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    PASS=$((PASS + 1))
    echo "OK   $desc"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL $desc -- got: [$actual] want: [$expected]"
  fi
}

# req METHOD PATH BODY KEY -- prints "<json-body>\n<http_status>"
req() {
  local method="$1" path="$2" body="${3:-}" key="${4:-}"
  local args=(-s -X "$method" -w '\n%{http_code}' -H 'Content-Type: application/json')
  [ -n "$key" ] && args+=(-H "x-program-key: $key")
  [ -n "$body" ] && args+=(-d "$body")
  curl "${args[@]}" "$SDK_BASE$path"
}

sdk_tests() {
  echo "== sdk-api =="

  # 401 without the key
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SDK_BASE/program")
  check "GET /program without key -> 401" "$code" "401"

  # 401 with a wrong key
  code=$(curl -s -o /dev/null -w '%{http_code}' -H 'x-program-key: definitely-wrong' "$SDK_BASE/program")
  check "GET /program wrong key -> 401" "$code" "401"

  # GET /program
  local r body status
  r=$(req GET /program "" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /program status code" "$status" "200"
  check "GET /program .status" "$(echo "$body" | jq -r .status)" "published"
  check "GET /program .invite_url" "$(echo "$body" | jq -r .invite_url)" "https://app.loyaltygo.pl/SEEDA1"

  # scan known card
  r=$(req POST /scans "{\"card_token\":\"$CARD_A\"}" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /scans known card status" "$status" "200"
  check "POST /scans .member.points_balance" "$(echo "$body" | jq -r .member.points_balance)" "100"
  check "POST /scans .offers length" "$(echo "$body" | jq '.offers | length')" "1"
  local scan_token
  scan_token=$(echo "$body" | jq -r .scan_token)
  check "POST /scans scan_token present" "$([ -n "$scan_token" ] && [ "$scan_token" != "null" ] && echo yes)" "yes"

  # scan a foreign card
  r=$(req POST /scans "{\"card_token\":\"$CARD_B\"}" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /scans foreign card status" "$status" "404"
  check "POST /scans foreign card error code" "$(echo "$body" | jq -r .error.code)" "card_foreign_program"

  # scan garbage
  r=$(req POST /scans '{"card_token":"garbage-not-a-card"}' "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /scans garbage status" "$status" "422"
  check "POST /scans garbage error code" "$(echo "$body" | jq -r .error.code)" "card_unrecognized"

  # register transaction with the scan token
  r=$(req POST /transactions "{\"transaction_id\":\"TX-9001\",\"amount\":\"250.00\",\"scan_token\":\"$scan_token\"}" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /transactions register status" "$status" "201"
  check "POST /transactions .points_awarded" "$(echo "$body" | jq -r .points_awarded)" "25"
  check "POST /transactions .points_balance" "$(echo "$body" | jq -r .points_balance)" "125"

  # identical repeat -> idempotent replay
  r=$(req POST /transactions "{\"transaction_id\":\"TX-9001\",\"amount\":\"250.00\",\"scan_token\":\"$scan_token\"}" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /transactions replay status" "$status" "200"
  check "POST /transactions replay .idempotent_replay" "$(echo "$body" | jq -r .idempotent_replay)" "true"

  # amount 0.00 -> validation error
  r=$(req POST /transactions "{\"transaction_id\":\"TX-9002\",\"amount\":\"0.00\",\"scan_token\":\"$scan_token\"}" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /transactions amount 0.00 status" "$status" "422"
  check "POST /transactions amount 0.00 error code" "$(echo "$body" | jq -r .error.code)" "validation_failed"

  # neither scan_token nor card_token -> member_not_identified
  r=$(req POST /transactions '{"transaction_id":"TX-9003","amount":"10.00"}' "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST /transactions no identity status" "$status" "422"
  check "POST /transactions no identity error code" "$(echo "$body" | jq -r .error.code)" "member_not_identified"

  # cancellation
  r=$(req POST /transactions/TX-9001/cancellation "" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST cancellation status" "$status" "200"
  check "POST cancellation .points_reverted" "$(echo "$body" | jq -r .points_reverted)" "25"

  # second cancellation -> already_cancelled
  r=$(req POST /transactions/TX-9001/cancellation "" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST cancellation repeat status" "$status" "200"
  check "POST cancellation repeat .already_cancelled" "$(echo "$body" | jq -r .already_cancelled)" "true"

  # cancellation of unknown transaction id
  r=$(req POST /transactions/TX-DOES-NOT-EXIST/cancellation "" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "POST cancellation unknown status" "$status" "404"
  check "POST cancellation unknown error code" "$(echo "$body" | jq -r .error.code)" "transaction_unknown"
}

public_tests() {
  echo "== public-api == (Task 6 — not implemented yet)"
}

panel_tests() {
  echo "== panel-api == (Task 7 — not implemented yet)"
}

SECTION="${1:-all}"
case "$SECTION" in
  sdk) sdk_tests ;;
  public) public_tests ;;
  panel) panel_tests ;;
  all) sdk_tests; public_tests; panel_tests ;;
  *) echo "usage: $0 [sdk|public|panel]"; exit 2 ;;
esac

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
