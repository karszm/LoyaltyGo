#!/usr/bin/env bash
# smoke.sh — real HTTP smoke tests against locally-served Edge Functions.
#
# Prereqs:
#   supabase start
#   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/seed.sql
#   supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt &
#   (the CLI serves every function in supabase/functions/ together -- it does not take a
#   single function name as an argument)
#
# Usage: backend/supabase/tests/smoke.sh [sdk|public|panel|cors]   (default: all sections)
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
  check "GET /program .invite_url" "$(echo "$body" | jq -r .invite_url)" "https://karta.loyaltygo.pl/SEEDA1"

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

  # -- GET /invites/:code: unpublished program -> status only, branding stays private --

  psql_exec "update public.programs set status='draft' where id='$PROGRAM_B';"
  r=$(preq GET /invites/SEEDB1)
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /invites draft program status" "$status" "200"
  check "GET /invites draft program .status" "$(echo "$body" | jq -r .status)" "unpublished"
  check "GET /invites draft program has no display_name" "$(echo "$body" | jq 'has("display_name")')" "false"
  psql_exec "update public.programs set status='published' where id='$PROGRAM_B';"

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

  # -- join: same e-mail again, 5x rapidly -> all 202, no id/balance/pass, name NOT updated, --
  # -- and at most ONE new token row across all 5 (send-throttled after the first) --

  local join_tokens_before join_tokens_after all_202="yes" first_repeat_body=""
  join_tokens_before=$(psql_count "select count(*) from public.card_link_tokens;")
  for i in 1 2 3 4 5; do
    r=$(preq POST /invites/SEEDA1/join \
      "{\"first_name\":\"Inny$i\",\"last_name\":\"Ktos$i\",\"email\":\"$new_email\",\"consent\":true}")
    body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
    [ "$status" = "202" ] || all_202="no (call $i -> $status)"
    [ "$i" = "1" ] && first_repeat_body="$body"
  done
  check "join repeat email x5 all 202" "$all_202" "yes"
  check "join repeat email .message" "$(echo "$first_repeat_body" | jq -r .message)" "$MAYBE_MSG"
  check "join repeat email has no membership_id" "$(echo "$first_repeat_body" | jq 'has("membership_id")')" "false"
  check "join repeat email has no pass" "$(echo "$first_repeat_body" | jq 'has("pass")')" "false"
  check "join repeat email has no points_balance" "$(echo "$first_repeat_body" | jq 'has("points_balance")')" "false"
  check "join repeat email DB first_name unchanged" \
    "$(psql_count "select first_name from public.members where email='$new_email';")" "Nowy"
  join_tokens_after=$(psql_count "select count(*) from public.card_link_tokens;")
  check "join repeat email x5 at most one new token row" \
    "$([ $((join_tokens_after - join_tokens_before)) -le 1 ] && echo yes)" "yes"

  # -- join: first_name length cap (JoinRequest.first_name maxLength: 80) --

  local long81 long80
  long81=$(printf 'a%.0s' $(seq 1 81))
  long80=$(printf 'a%.0s' $(seq 1 80))

  r=$(preq POST /invites/SEEDA1/join \
    "{\"first_name\":\"$long81\",\"last_name\":\"B\",\"email\":\"toolong-$$@test.pl\",\"consent\":true}")
  status=$(echo "$r" | tail -1)
  check "join first_name 81 chars status" "$status" "422"

  r=$(preq POST /invites/SEEDA1/join \
    "{\"first_name\":\"$long80\",\"last_name\":\"B\",\"email\":\"exactly80-$$@test.pl\",\"consent\":true}")
  status=$(echo "$r" | tail -1)
  check "join first_name 80 chars status" "$status" "201"

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

  # -- card-recovery: member and non-member, twice each -> ALWAYS 202, never 429, and the --
  # -- member/non-member bodies (and statuses) are indistinguishable from one another --
  # -- (this is the regression test for the send-throttle-as-enumeration-oracle bug: a --
  # -- limiter keyed on membership would show up here as a 429 on the member's second call --
  # -- but never on the non-member's, even with an identical response body). --

  local tokens_before tokens_after_1 tokens_after_2 tokens_after_3 tokens_after_4
  tokens_before=$(psql_count "select count(*) from public.card_link_tokens;")

  r=$(preq POST /invites/SEEDA1/card-recovery '{"email":"seed-member-a@test.pl"}')
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  local body_1="$body"
  check "card-recovery member call 1 status" "$status" "202"
  check "card-recovery member call 1 .message" "$(echo "$body" | jq -r .message)" "$MAYBE_MSG"
  tokens_after_1=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery member call 1 created exactly one token row" "$((tokens_after_1 - tokens_before))" "1"

  local first_token
  first_token=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' order by created_at desc limit 1;")

  r=$(preq POST /invites/SEEDA1/card-recovery '{"email":"seed-member-a@test.pl"}')
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "card-recovery member call 2 (throttled) status" "$status" "202"
  check "card-recovery member call 2 body identical to call 1 (throttle is invisible to caller)" "$body" "$body_1"
  tokens_after_2=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery member call 2 (throttled) created no token row (send actually suppressed)" \
    "$tokens_after_2" "$tokens_after_1"

  r=$(preq POST /invites/SEEDA1/card-recovery '{"email":"nobody-here@test.pl"}')
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "card-recovery non-member call 1 status" "$status" "202"
  check "card-recovery non-member call 1 body identical to member's" "$body" "$body_1"
  tokens_after_3=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery non-member call 1 created no token row" "$tokens_after_3" "$tokens_after_1"

  r=$(preq POST /invites/SEEDA1/card-recovery '{"email":"nobody-here@test.pl"}')
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "card-recovery non-member call 2 status" "$status" "202"
  check "card-recovery non-member call 2 body identical to member's" "$body" "$body_1"
  tokens_after_4=$(psql_count "select count(*) from public.card_link_tokens;")
  check "card-recovery non-member call 2 created no token row" "$tokens_after_4" "$tokens_after_1"

  # -- GET /card-links/:token --

  code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE/card-links/garbage-token-does-not-exist")
  check "GET /card-links garbage token status" "$code" "404"

  # malformed percent-escape (lone surrogate half) -> 404, not a 500 from decodeURIComponent
  code=$(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_BASE/card-links/%ED%A0%80")
  check "GET /card-links malformed percent-escape status" "$code" "404"

  # expired token: insert one directly, 1h in the past. The 410 body must still carry
  # invite_code (MEMBER_A -> program A -> SEEDA1) so the page can link the customer back
  # to the program page even though their card link itself is dead.
  psql_exec "insert into public.card_link_tokens (member_id, expires_at) values ('$MEMBER_A', now() - interval '1 hour');"
  local expired_token
  expired_token=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' and expires_at < now() order by created_at desc limit 1;")
  r=$(preq GET "/card-links/$expired_token")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /card-links expired token status" "$status" "410"
  check "GET /card-links expired token .invite_code" "$(echo "$body" | jq -r .invite_code)" "SEEDA1"

  # lazy retry: MEMBER_A's pass_status is 'pending' by default (seed never sets it) --
  # hitting the still-valid $first_token must retry issuance now and flip the DB row.
  check "MEMBER_A pass_status is pending before lazy retry" \
    "$(psql_count "select pass_status from public.members where id='$MEMBER_A';")" "pending"
  r=$(preq GET "/card-links/$first_token")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /card-links lazy retry status" "$status" "200"
  check "GET /card-links lazy retry .status" "$(echo "$body" | jq -r .status)" "ready"
  # Branding travels on the ready response too -- this is what the card-link page renders
  # as the merchant's brand (Seed Salon A, program A's seeded display_name).
  check "GET /card-links lazy retry .display_name" "$(echo "$body" | jq -r .display_name)" "Seed Salon A"
  check "GET /card-links lazy retry .invite_code" "$(echo "$body" | jq -r .invite_code)" "SEEDA1"
  check "MEMBER_A pass_status flipped to ready in DB" \
    "$(psql_count "select pass_status from public.members where id='$MEMBER_A';")" "ready"
}

panel_tests() {
  echo "== panel-api =="

  local PANEL_BASE="$BASE_URL/panel-api"
  local PROGRAM_A="53000000-0000-0000-0000-000000000001"
  local PROGRAM_B="63000000-0000-0000-0000-000000000001"
  local PROGRAM_C="73000000-0000-0000-0000-000000000001"
  local SUB_A="51000000-0000-0000-0000-000000000001"
  local SUB_B="61000000-0000-0000-0000-000000000001"
  local SUB_C="71000000-0000-0000-0000-000000000001"

  # mint_jwt SUB -- HS256 JWT signed with the local stack's JWT_SECRET, claims matching what
  # GoTrue/resolveMerchant expect. No node/deno dependency: openssl is already required by
  # this script's environment and is enough for HMAC-SHA256 + base64url by hand.
  local JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long"
  b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  mint_jwt() {
    local sub="$1"
    local header='{"alg":"HS256","typ":"JWT"}'
    local payload h p signing_input sig
    payload=$(printf '{"sub":"%s","role":"authenticated","aud":"authenticated","exp":4102444800}' "$sub")
    h=$(printf '%s' "$header" | b64url)
    p=$(printf '%s' "$payload" | b64url)
    signing_input="${h}.${p}"
    sig=$(printf '%s' "$signing_input" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
    printf '%s.%s' "$signing_input" "$sig"
  }

  local JWT_A JWT_B JWT_C
  JWT_A=$(mint_jwt "$SUB_A")
  JWT_B=$(mint_jwt "$SUB_B")
  JWT_C=$(mint_jwt "$SUB_C")

  # preq METHOD PATH BODY JWT -- prints "<json-body>\n<http_code>"
  preq() {
    local method="$1" path="$2" body="${3:-}" jwt="${4:-}"
    local args=(-s -X "$method" -w '\n%{http_code}' -H 'Content-Type: application/json')
    [ -n "$jwt" ] && args+=(-H "Authorization: Bearer $jwt")
    [ -n "$body" ] && args+=(-d "$body")
    curl "${args[@]}" "$PANEL_BASE$path"
  }

  local r body status

  # -- no JWT -> 401 --

  r=$(preq GET /program/key)
  status=$(echo "$r" | tail -1)
  check "GET /program/key no JWT status" "$status" "401"

  # -- draft program (merchant C, before publish): key not available yet --

  r=$(preq GET /program/key "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /program/key draft program status" "$status" "409"
  check "GET /program/key draft program error code" "$(echo "$body" | jq -r .error.code)" "program_not_published"

  # -- publish: both display_name and logo_url missing -> 422 listing both --

  r=$(preq POST /program/publish "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "publish both fields missing status" "$status" "422"
  check "publish both fields missing lists display_name" \
    "$(echo "$body" | jq '[.error.fields[].field] | index("display_name") != null')" "true"
  check "publish both fields missing lists logo_url" \
    "$(echo "$body" | jq '[.error.fields[].field] | index("logo_url") != null')" "true"
  check "publish both fields missing: program still draft" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "draft"

  # -- publish: display_name set, logo_url still missing -> 422 listing only logo_url --

  psql_exec "update public.programs set display_name='Seed Draft Salon C' where id='$PROGRAM_C';"
  r=$(preq POST /program/publish "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "publish logo_url missing status" "$status" "422"
  check "publish logo_url missing .error.fields length" "$(echo "$body" | jq '.error.fields | length')" "1"
  check "publish logo_url missing .error.fields[0].field" "$(echo "$body" | jq -r '.error.fields[0].field')" "logo_url"
  check "publish logo_url missing: program still draft" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "draft"

  # -- publish: both set -> 200, published, invite_code + program_key_plaintext --

  psql_exec "update public.programs set logo_url='https://cdn.test/c-logo.png' where id='$PROGRAM_C';"
  r=$(preq POST /program/publish "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "publish success status" "$status" "200"
  check "publish success .status" "$(echo "$body" | jq -r .status)" "published"
  check "publish success DB status" "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "published"
  check "publish success DB invite_code non-null" \
    "$(psql_count "select (invite_code is not null) from public.programs where id='$PROGRAM_C';")" "t"

  local key_plaintext_1
  key_plaintext_1=$(echo "$body" | jq -r .program_key_plaintext)
  check "publish success program_key_plaintext matches format" \
    "$(echo "$key_plaintext_1" | grep -qE '^lgo_pk_[A-Za-z0-9_-]{43}$' && echo yes)" "yes"

  local passkit_id_1
  passkit_id_1=$(psql_count "select passkit_program_id from public.programs where id='$PROGRAM_C';")
  check "publish success DB passkit_program_id set" "$([ -n "$passkit_id_1" ] && echo yes)" "yes"

  # -- the new key actually works against sdk-api --

  r=$(curl -s -w '\n%{http_code}' -H "x-program-key: $key_plaintext_1" "$BASE_URL/sdk-api/program")
  status=$(echo "$r" | tail -1)
  check "new program key works on sdk-api GET /program" "$status" "200"

  # -- publish again -> idempotent: 200, no second PassKit provisioning, no new key --

  r=$(preq POST /program/publish "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "publish idempotent status" "$status" "200"
  check "publish idempotent .status" "$(echo "$body" | jq -r .status)" "published"
  check "publish idempotent no program_key_plaintext" "$(echo "$body" | jq 'has("program_key_plaintext")')" "false"
  check "publish idempotent passkit_program_id unchanged" \
    "$(psql_count "select passkit_program_id from public.programs where id='$PROGRAM_C';")" "$passkit_id_1"

  # the first key must still work (no silent rotation on the idempotent path)
  r=$(curl -s -w '\n%{http_code}' -H "x-program-key: $key_plaintext_1" "$BASE_URL/sdk-api/program")
  status=$(echo "$r" | tail -1)
  check "key still works after idempotent republish" "$status" "200"

  # -- fix round 1: publish must NOT revive a suspended program (and must NOT silently --
  # -- rotate its key while doing so) --

  local key_hash_before_suspended_publish key_hash_after_suspended_publish
  key_hash_before_suspended_publish=$(psql_count "select key_hash from public.programs where id='$PROGRAM_C';")
  psql_exec "update public.programs set status='suspended' where id='$PROGRAM_C';"
  r=$(preq POST /program/publish "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "publish on suspended program status" "$status" "409"
  check "publish on suspended program error code" "$(echo "$body" | jq -r .error.code)" "invalid_state_transition"
  check "publish on suspended program: DB status still suspended" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "suspended"
  key_hash_after_suspended_publish=$(psql_count "select key_hash from public.programs where id='$PROGRAM_C';")
  check "publish on suspended program: key_hash NOT silently rotated" \
    "$key_hash_after_suspended_publish" "$key_hash_before_suspended_publish"
  psql_exec "update public.programs set status='published' where id='$PROGRAM_C';"

  # -- GET /program/key: masked value + timestamps --

  r=$(preq GET /program/key "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /program/key published status" "$status" "200"
  check "GET /program/key .program_key starts with lgo_pk_" \
    "$(echo "$body" | jq -r .program_key | grep -q '^lgo_pk_' && echo yes)" "yes"
  check "GET /program/key .program_key is NOT the real plaintext (masked)" \
    "$([ "$(echo "$body" | jq -r .program_key)" != "$key_plaintext_1" ] && echo yes)" "yes"
  check "GET /program/key .created_at present" \
    "$([ "$(echo "$body" | jq -r .created_at)" != "null" ] && echo yes)" "yes"

  # -- rotation: old key dies immediately, new key works --

  r=$(preq POST /program/key "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "rotate key status" "$status" "201"
  local key_plaintext_2
  key_plaintext_2=$(echo "$body" | jq -r .program_key)
  check "rotate key returns new plaintext (different from first)" \
    "$([ "$key_plaintext_2" != "$key_plaintext_1" ] && echo yes)" "yes"
  check "rotate key format" \
    "$(echo "$key_plaintext_2" | grep -qE '^lgo_pk_[A-Za-z0-9_-]{43}$' && echo yes)" "yes"

  r=$(curl -s -w '\n%{http_code}' -H "x-program-key: $key_plaintext_1" "$BASE_URL/sdk-api/program")
  status=$(echo "$r" | tail -1)
  check "old key rejected after rotation" "$status" "401"

  r=$(curl -s -w '\n%{http_code}' -H "x-program-key: $key_plaintext_2" "$BASE_URL/sdk-api/program")
  status=$(echo "$r" | tail -1)
  check "new key works after rotation" "$status" "200"

  # -- close without confirm -> 409 confirmation_required + real affected_members --

  local real_member_count
  real_member_count=$(psql_count "select count(*) from public.members where program_id='$PROGRAM_C';")
  r=$(preq POST /program/close "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "close without confirm status" "$status" "409"
  check "close without confirm error code" "$(echo "$body" | jq -r .error.code)" "confirmation_required"
  check "close without confirm affected_members" "$(echo "$body" | jq -r .affected_members)" "$real_member_count"
  check "close without confirm: program still published" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "published"

  # -- close with confirm:true -> 200, closed --

  r=$(preq POST /program/close '{"confirm":true}' "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "close with confirm status" "$status" "200"
  check "close with confirm .status" "$(echo "$body" | jq -r .status)" "closed"
  check "close with confirm DB status" "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "closed"

  # -- fix round 1: publish must NOT revive a closed program (contract calls close --
  # -- irreversible) --

  r=$(preq POST /program/publish "" "$JWT_C")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "publish on closed program status" "$status" "409"
  check "publish on closed program error code" "$(echo "$body" | jq -r .error.code)" "invalid_state_transition"
  check "publish on closed program: DB status still closed" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_C';")" "closed"

  # -- illegal transitions --

  # suspend on a closed program -> 409
  r=$(preq POST /program/suspend "" "$JWT_C")
  status=$(echo "$r" | tail -1)
  check "suspend on closed program status" "$status" "409"

  # resume on a published program (merchant A, untouched fixture) -> 409
  r=$(preq POST /program/resume "" "$JWT_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "resume on published program status" "$status" "409"
  check "resume on published program: A still published in DB" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_A';")" "published"

  # -- cross-tenant: A suspends its own program, B's row must stay untouched --

  local b_key_hash_before b_key_hash_after
  b_key_hash_before=$(psql_count "select key_hash from public.programs where id='$PROGRAM_B';")

  r=$(preq POST /program/suspend "" "$JWT_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "suspend own (A) program status" "$status" "200"
  check "suspend own (A) program .status" "$(echo "$body" | jq -r .status)" "suspended"
  check "A suspended in DB" "$(psql_count "select status from public.programs where id='$PROGRAM_A';")" "suspended"
  check "B untouched by A's suspend (status)" \
    "$(psql_count "select status from public.programs where id='$PROGRAM_B';")" "published"
  b_key_hash_after=$(psql_count "select key_hash from public.programs where id='$PROGRAM_B';")
  check "B untouched by A's suspend (key_hash)" "$b_key_hash_after" "$b_key_hash_before"

  # restore A to published so the sdk/public sections stay green on a full run
  r=$(preq POST /program/resume "" "$JWT_A")
  status=$(echo "$r" | tail -1)
  check "resume A back to published status" "$status" "200"
  check "A restored to published in DB" "$(psql_count "select status from public.programs where id='$PROGRAM_A';")" "published"

  # -- POST /members/:id/adjustment (migration 0012) --
  # Balances are read from the DB, not assumed: earlier sections may have already moved them.

  local MEMBER_A="54000000-0000-0000-0000-000000000001"
  local MEMBER_B="64000000-0000-0000-0000-000000000001"
  local bal_a bal_b
  bal_a=$(psql_count "select points_balance from public.members where id='$MEMBER_A';")
  bal_b=$(psql_count "select points_balance from public.members where id='$MEMBER_B';")

  r=$(preq POST "/members/$MEMBER_A/adjustment" '{"delta":12,"description":"smoke: premia"}' "$JWT_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "adjustment +12 status" "$status" "201"
  check "adjustment +12 balance in response" "$(echo "$body" | jq -r .points_balance)" "$((bal_a + 12))"
  check "adjustment +12 balance in DB" \
    "$(psql_count "select points_balance from public.members where id='$MEMBER_A';")" "$((bal_a + 12))"
  check "adjustment row lands in transactions" \
    "$(psql_count "select count(*) from public.transactions where member_id='$MEMBER_A' and source='manual' and description='smoke: premia';")" "1"

  # over-balance withdrawal -> 409, balance untouched
  r=$(preq POST "/members/$MEMBER_A/adjustment" "{\"delta\":-$((bal_a + 13)),\"description\":\"smoke: za duzo\"}" "$JWT_A")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "over-balance adjustment status" "$status" "409"
  check "over-balance adjustment code" "$(echo "$body" | jq -r .error.code)" "insufficient_balance"
  check "over-balance leaves balance untouched" \
    "$(psql_count "select points_balance from public.members where id='$MEMBER_A';")" "$((bal_a + 12))"

  # validation: delta 0 / missing description -> 422
  r=$(preq POST "/members/$MEMBER_A/adjustment" '{"delta":0,"description":""}' "$JWT_A")
  status=$(echo "$r" | tail -1)
  check "adjustment delta 0 status" "$status" "422"

  # cross-tenant: merchant A adjusting B's member -> 404, B's balance untouched
  r=$(preq POST "/members/$MEMBER_B/adjustment" '{"delta":5,"description":"smoke: cudzy"}' "$JWT_A")
  status=$(echo "$r" | tail -1)
  check "cross-tenant adjustment status" "$status" "404"
  check "cross-tenant adjustment leaves B untouched" \
    "$(psql_count "select points_balance from public.members where id='$MEMBER_B';")" "$bal_b"

  # non-uuid member segment never reaches the handler -> 404 at the path gate
  r=$(preq POST "/members/not-a-uuid/adjustment" '{"delta":5,"description":"smoke"}' "$JWT_A")
  status=$(echo "$r" | tail -1)
  check "adjustment with non-uuid member status" "$status" "404"

  # restore A's balance so a re-run of this section starts from the same point
  r=$(preq POST "/members/$MEMBER_A/adjustment" '{"delta":-12,"description":"smoke: sprzatanie"}' "$JWT_A")
  status=$(echo "$r" | tail -1)
  check "adjustment -12 (cleanup) status" "$status" "201"
  check "A balance restored" \
    "$(psql_count "select points_balance from public.members where id='$MEMBER_A';")" "$bal_a"
}

cors_tests() {
  echo "== cors =="

  local origin="http://127.0.0.1:3000"
  local pair fn path headers status origin_header

  # Preflight (OPTIONS) on one real route per function must succeed with
  # access-control-allow-origin: * -- before this task these all fell through to the
  # method if-chain in the function itself and came back 405 (confirmed by curling the
  # edge-runtime container directly, bypassing Kong -- see task-1-report.md).
  #
  # Through BASE_URL (Kong on :54321, what a browser actually hits locally) the expected
  # status is 200, not the function's own 204: the local `supabase start` kong.yml applies
  # a "cors" plugin to the functions-v1 route too, so Kong answers OPTIONS itself before
  # the request ever reaches our preflight() -- our 204 never surfaces through Kong. This
  # check therefore asserts the observable local-browser behaviour (succeeds, not 405/count
  # blocked), not literally which layer answered it.
  for pair in "sdk-api:/program" "public-api:/invites/SEEDA1" "panel-api:/program/key"; do
    fn="${pair%%:*}"
    path="${pair#*:}"
    headers=$(curl -s -D - -o /dev/null -X OPTIONS \
      -H "Origin: $origin" -H "Access-Control-Request-Method: GET" \
      "$BASE_URL/$fn$path")
    status=$(echo "$headers" | head -1 | awk '{print $2}')
    origin_header=$(echo "$headers" | grep -i '^access-control-allow-origin:' | tr -d '\r' | awk '{print $2}')
    check "OPTIONS $fn$path preflight status" "$status" "200"
    check "OPTIONS $fn$path preflight allow-origin" "$origin_header" "*"
  done

  # A real (non-preflight) 401 must carry the header too -- without it the browser hides
  # the error body from the panel's fetch(), and the panel can't show the message it was given.
  headers=$(curl -s -D - -o /dev/null "$BASE_URL/sdk-api/program")
  origin_header=$(echo "$headers" | grep -i '^access-control-allow-origin:' | tr -d '\r' | awk '{print $2}')
  check "401 GET /program (no key) carries access-control-allow-origin" "$origin_header" "*"

  # -- direct-to-function checks (bypass Kong) --
  # The two checks above go through Kong (BASE_URL), and Kong's own "cors" plugin on the
  # functions-v1 route (see kong.yml inside the supabase_kong_backend container) answers
  # OPTIONS itself and stamps access-control-allow-origin onto EVERY response through that
  # route -- including the old, unpatched code's. So a through-Kong check cannot regress if
  # _shared/http.ts or _shared/errors.ts loses its CORS headers; it stays green either way.
  # Production has no such gateway in front of the functions, so what actually matters is
  # whether the function itself emits the headers. These two checks curl the edge-runtime
  # container directly (from a throwaway container on the same compose network, since its
  # port isn't published to the host) to catch exactly that regression.
  #
  # Container/network names are derived, not hardcoded: they're generated by the Supabase
  # CLI from config.toml's project_id ("backend") as supabase_edge_runtime_<project_id> /
  # supabase_network_<project_id>. Renaming the project changes both.
  local edge_container edge_network
  edge_container=$(docker ps --filter "name=supabase_edge_runtime" --format '{{.Names}}' | head -1)
  edge_network=$(docker network ls --filter "name=supabase_network" --format '{{.Name}}' | head -1)

  if [ -z "$edge_container" ] || [ -z "$edge_network" ]; then
    check "direct-to-function cors checks (edge-runtime container/network found)" "not found" "found"
  else
    status=$(docker run --rm --network "$edge_network" curlimages/curl:latest -s -o /dev/null -w '%{http_code}' \
      -X OPTIONS -H "Origin: $origin" -H "Access-Control-Request-Method: GET" \
      "http://$edge_container:8081/panel-api/program/key")
    check "OPTIONS panel-api/program/key direct-to-function (no Kong) preflight status" "$status" "204"

    headers=$(docker run --rm --network "$edge_network" curlimages/curl:latest -s -D - -o /dev/null \
      "http://$edge_container:8081/sdk-api/program")
    origin_header=$(echo "$headers" | grep -i '^access-control-allow-origin:' | tr -d '\r' | awk '{print $2}')
    check "401 GET /program direct-to-function (no Kong) carries access-control-allow-origin" "$origin_header" "*"
  fi
}

SECTION="${1:-all}"
case "$SECTION" in
  sdk) sdk_tests ;;
  public) public_tests ;;
  panel) panel_tests ;;
  cors) cors_tests ;;
  all) sdk_tests; public_tests; panel_tests; cors_tests ;;
  *) echo "usage: $0 [sdk|public|panel|cors]"; exit 2 ;;
esac

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
