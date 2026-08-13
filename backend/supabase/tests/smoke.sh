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
KEY_B="test-b"              # plaintext program key, merchant B (seed.sql)
CARD_A="seed-card-a-001"
CARD_B="seed-card-b-001"   # belongs to merchant B — used for cross-tenant checks
PROGRAM_A="53000000-0000-0000-0000-000000000001"

# psql_count SQL -- runs a scalar count query against the local DB via docker, trimmed
psql_count() {
  docker exec -i supabase_db_backend psql -U postgres -d postgres -tAc "$1" | tr -d '[:space:]'
}

# psql_exec SQL -- runs a statement against the local DB via docker (no output needed)
psql_exec() {
  docker exec -i supabase_db_backend psql -U postgres -d postgres -c "$1" > /dev/null
}

# days_ago N -- ISO-8601 UTC timestamp N days in the past (BSD date, GNU date fallback)
days_ago() {
  date -u -v-"$1"d +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "-$1 days" +"%Y-%m-%dT%H:%M:%SZ"
}

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

  # -- security regressions (fix round 1) --

  # cross-program scan token: merchant B must not be able to use a scan_token issued
  # under merchant A's key.
  local cross_tx="TX-CROSS-1"
  r=$(req POST /transactions "{\"transaction_id\":\"$cross_tx\",\"amount\":\"10.00\",\"scan_token\":\"$scan_token\"}" "$KEY_B")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "cross-program scan_token status" "$status" "409"
  check "cross-program scan_token error code" "$(echo "$body" | jq -r .error.code)" "scan_context_expired"
  check "cross-program scan_token created no transaction row" \
    "$(psql_count "select count(*) from public.transactions where softpos_transaction_id='$cross_tx';")" "0"

  # tampered token: flip a char in the signature segment -> signature no longer matches.
  local tampered="${scan_token%.*}.X${scan_token##*.?}"
  r=$(req POST /transactions "{\"transaction_id\":\"TX-TAMPER-1\",\"amount\":\"10.00\",\"scan_token\":\"$tampered\"}" "$KEY_A")
  status=$(echo "$r" | tail -1)
  check "tampered scan_token status" "$status" "409"

  # performed_at with an unparseable date -> 422 validation_failed, not a 500 from Postgres.
  r=$(req POST /transactions \
    "{\"transaction_id\":\"TX-BADDATE-1\",\"amount\":\"10.00\",\"card_token\":\"$CARD_A\",\"performed_at\":\"not-a-date\"}" "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "invalid performed_at status" "$status" "422"
  check "invalid performed_at error code" "$(echo "$body" | jq -r .error.code)" "validation_failed"

  # repeated foreign-card offline sync must leave exactly one sync_rejections row (the
  # offline queue retries a rejected batch as routine, not an exception).
  local foreign_tx="TX-FOREIGN-DEDUP-1"
  req POST /transactions \
    "{\"transaction_id\":\"$foreign_tx\",\"amount\":\"5.00\",\"card_token\":\"$CARD_B\",\"performed_at\":\"2026-08-13T09:00:00Z\"}" \
    "$KEY_A" > /dev/null
  req POST /transactions \
    "{\"transaction_id\":\"$foreign_tx\",\"amount\":\"5.00\",\"card_token\":\"$CARD_B\",\"performed_at\":\"2026-08-13T09:00:00Z\"}" \
    "$KEY_A" > /dev/null
  check "repeated foreign-card sync_rejections row count" \
    "$(psql_count "select count(*) from public.sync_rejections where program_id='$PROGRAM_A' and softpos_transaction_id='$foreign_tx';")" \
    "1"

  # -- fix round 2 --

  # (Round 2's "performed_at: '0' -> 201" case lived here. Superseded by round 3's strict
  # RFC 3339 check below, which rejects "0" outright -- Date.parse being lenient enough to
  # accept it turned out to be a security hole, not just a status-code question: see the
  # "0"/year-2000 cases under fix round 3.)

  # coupon_ids: null on the offline path must be accepted as "no coupons", not confused
  # with the coupons-forbidden-offline ban (which only fires for a non-empty array).
  r=$(req POST /transactions \
    '{"transaction_id":"TX-COUPON-NULL-OFFLINE","amount":"10.00","card_token":"'"$CARD_A"'","performed_at":"2026-08-13T09:20:00Z","coupon_ids":null}' \
    "$KEY_A")
  status=$(echo "$r" | tail -1)
  check "coupon_ids null offline status" "$status" "201"

  # -- fix round 3: strict RFC 3339 + plausibility window --

  # "0": Date.parse("0") is finite (parses as 1999-12-31) but fails the RFC 3339 format
  # check now required first -> 422, not the 201 round 2 produced.
  r=$(req POST /transactions '{"transaction_id":"TX-ZERO-DATE-2","amount":"10.00","card_token":"'"$CARD_A"'","performed_at":"0"}' "$KEY_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "performed_at '0' status (strict RFC 3339)" "$status" "422"
  check "performed_at '0' error code" "$(echo "$body" | jq -r .error.code)" "validation_failed"

  # well-formed but 60 days in the past -> outside the plausibility window -> 422.
  r=$(req POST /transactions \
    "{\"transaction_id\":\"TX-WINDOW-60D\",\"amount\":\"10.00\",\"card_token\":\"$CARD_A\",\"performed_at\":\"$(days_ago 60)\"}" "$KEY_A")
  status=$(echo "$r" | tail -1)
  check "performed_at 60 days ago status" "$status" "422"

  # THE security case: a far-past performed_at must not bypass the suspension check.
  # Suspend program A, then attempt an offline sync dated at the epoch of Y2K -- well
  # outside the 30-day window -- and confirm it's rejected before it ever reaches the
  # status_changed_at comparison.
  psql_exec "update public.programs set status='suspended' where id='$PROGRAM_A';"
  r=$(req POST /transactions \
    '{"transaction_id":"TX-ATTACK-Y2K-SMOKE","amount":"10.00","card_token":"'"$CARD_A"'","performed_at":"2000-01-01T00:00:00Z"}' \
    "$KEY_A")
  status=$(echo "$r" | tail -1)
  check "suspended program + year-2000 performed_at status" "$status" "422"
  psql_exec "update public.programs set status='published' where id='$PROGRAM_A';"
}

public_tests() {
  echo "== public-api =="

  local PUBLIC_BASE="$BASE_URL/public-api"
  local PROGRAM_B="63000000-0000-0000-0000-000000000001"
  local MEMBER_A="54000000-0000-0000-0000-000000000001"   # seed-member-a@test.pl, pass_status=pending by default
  local MAYBE_MSG="Jeżeli ten adres należy do programu u tego merchanta, karta pojawi się w Twojej skrzynce e-mail."

  # preq METHOD PATH BODY -- prints "<json-body>\n<http_code>", no auth (public surface)
  preq() {
    local method="$1" path="$2" body="${3:-}"
    local args=(-s -X "$method" -w '\n%{http_code}' -H 'Content-Type: application/json')
    [ -n "$body" ] && args+=(-d "$body")
    curl "${args[@]}" "$PUBLIC_BASE$path"
  }

  local r body status

  # -- GET /invites/:code --

  r=$(preq GET /invites/SEEDA1)
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /invites/SEEDA1 status" "$status" "200"
  check "GET /invites/SEEDA1 .status" "$(echo "$body" | jq -r .status)" "active"
  check "GET /invites/SEEDA1 .display_name" "$(echo "$body" | jq -r .display_name)" "Seed Salon A"

  code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE/invites/BOGUS9")
  check "GET /invites/BOGUS9 (bogus code) status" "$code" "404"

  # -- join: new e-mail -> 201 ready --

  local new_email="new-member-$$@test.pl"
  r=$(preq POST /invites/SEEDA1/join \
    "{\"first_name\":\"Nowy\",\"last_name\":\"Klient\",\"email\":\"$new_email\",\"consent\":true}")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join new email status" "$status" "201"
  check "join new email .pass.status" "$(echo "$body" | jq -r .pass.status)" "ready"
  check "join new email .pass.apple_wallet_url present" \
    "$([ "$(echo "$body" | jq -r .pass.apple_wallet_url)" != "null" ] && echo yes)" "yes"
  local membership_id
  membership_id=$(echo "$body" | jq -r .membership_id)
  check "join new email membership_id present" "$([ -n "$membership_id" ] && [ "$membership_id" != "null" ] && echo yes)" "yes"
  check "join new email DB row consent_at set" \
    "$(psql_count "select count(*) from public.members where email='$new_email' and consent_at is not null;")" "1"

  # -- join: same e-mail again -> 202 maybe-response, no id/balance, name NOT updated --

  r=$(preq POST /invites/SEEDA1/join \
    "{\"first_name\":\"Inny\",\"last_name\":\"Ktos\",\"email\":\"$new_email\",\"consent\":true}")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join repeat email status" "$status" "202"
  check "join repeat email .message" "$(echo "$body" | jq -r .message)" "$MAYBE_MSG"
  check "join repeat email has no membership_id" "$(echo "$body" | jq 'has("membership_id")')" "false"
  check "join repeat email has no pass" "$(echo "$body" | jq 'has("pass")')" "false"
  check "join repeat email has no points_balance" "$(echo "$body" | jq 'has("points_balance")')" "false"
  check "join repeat email DB first_name unchanged" \
    "$(psql_count "select first_name from public.members where email='$new_email';")" "Nowy"

  # -- join: consent:false -> 422, no member row --

  local no_consent_email="no-consent-$$@test.pl"
  r=$(preq POST /invites/SEEDA1/join \
    "{\"first_name\":\"A\",\"last_name\":\"B\",\"email\":\"$no_consent_email\",\"consent\":false}")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join consent:false status" "$status" "422"
  check "join consent:false error code" "$(echo "$body" | jq -r .error.code)" "validation_failed"
  check "join consent:false no member row created" \
    "$(psql_count "select count(*) from public.members where email='$no_consent_email';")" "0"

  # -- join: suspended program -> 409 --

  psql_exec "update public.programs set status='suspended' where id='$PROGRAM_B';"
  r=$(preq POST /invites/SEEDB1/join \
    "{\"first_name\":\"A\",\"last_name\":\"B\",\"email\":\"suspend-join-$$@test.pl\",\"consent\":true}")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join suspended program status" "$status" "409"
  check "join suspended program error code" "$(echo "$body" | jq -r .error.code)" "program_unavailable"
  psql_exec "update public.programs set status='published' where id='$PROGRAM_B';"

  # -- card-recovery: member -> 202, exactly one new token row --

  local tokens_before tokens_after_g tokens_after_h tokens_after_i
  tokens_before=$(psql_count "select count(*) from public.card_link_tokens;")

  r=$(preq POST /invites/SEEDA1/card-recovery '{"email":"seed-member-a@test.pl"}')
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  local recovery_body_member="$body"
  check "card-recovery member status" "$status" "202"
  check "card-recovery member .message" "$(echo "$body" | jq -r .message)" "$MAYBE_MSG"
  tokens_after_g=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery member created exactly one token row" "$((tokens_after_g - tokens_before))" "1"

  local first_token
  first_token=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' order by created_at desc limit 1;")

  # -- card-recovery twice in a row -> second is 429 with Retry-After --

  local raw
  raw=$(curl -s -i -X POST -H 'Content-Type: application/json' \
    -d '{"email":"seed-member-a@test.pl"}' "$PUBLIC_BASE/invites/SEEDA1/card-recovery")
  status=$(echo "$raw" | head -1 | awk '{print $2}' | tr -d '\r')
  check "card-recovery rate-limited status" "$status" "429"
  check "card-recovery rate-limited has Retry-After header" \
    "$(echo "$raw" | grep -ic '^retry-after:')" "1"
  tokens_after_h=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery rate-limited created no token row" "$tokens_after_h" "$tokens_after_g"

  # -- card-recovery: non-member -> 202, byte-identical body, no new token row --

  r=$(preq POST /invites/SEEDA1/card-recovery '{"email":"nobody-here@test.pl"}')
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "card-recovery non-member status" "$status" "202"
  check "card-recovery non-member body byte-identical to member's" "$body" "$recovery_body_member"
  tokens_after_i=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery non-member created no token row" "$tokens_after_i" "$tokens_after_g"

  # -- GET /card-links/:token --

  code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE/card-links/garbage-token-does-not-exist")
  check "GET /card-links garbage token status" "$code" "404"

  # expired token: insert one directly, 1h in the past
  psql_exec "insert into public.card_link_tokens (member_id, expires_at) values ('$MEMBER_A', now() - interval '1 hour');"
  local expired_token
  expired_token=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' and expires_at < now() order by created_at desc limit 1;")
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE/card-links/$expired_token")
  check "GET /card-links expired token status" "$code" "410"

  # lazy retry: MEMBER_A's pass_status is 'pending' by default (seed never sets it) --
  # hitting the still-valid $first_token must retry issuance now and flip the DB row.
  check "MEMBER_A pass_status is pending before lazy retry" \
    "$(psql_count "select pass_status from public.members where id='$MEMBER_A';")" "pending"
  r=$(preq GET "/card-links/$first_token")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /card-links lazy retry status" "$status" "200"
  check "GET /card-links lazy retry .status" "$(echo "$body" | jq -r .status)" "ready"
  check "MEMBER_A pass_status flipped to ready in DB" \
    "$(psql_count "select pass_status from public.members where id='$MEMBER_A';")" "ready"
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
