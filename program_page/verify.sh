#!/usr/bin/env bash
# verify.sh — end-to-end smoke tests against a locally-served program_page, driven against a
# real local Supabase stack (styled like backend/supabase/tests/smoke.sh).
#
# Prereqs:
#   supabase start   (from backend/)
#   docker exec -i supabase_db_backend psql -U postgres -d postgres -f - < backend/supabase/tests/seed.sql
#   supabase functions serve --env-file supabase/functions/.env.local --no-verify-jwt &
#   cd program_page && npm run build && npx wrangler dev --port 8788 --local &
#     (astro's own `preview` command does not run the Cloudflare adapter — wrangler dev is
#     the only way to exercise the actual production build + middleware.ts)
#
# Usage: program_page/verify.sh [invite|join|recovery|cardlink|headers|budget]  (default: all)
#
# This script talks to the FRONTEND (program_page, BASE_URL below) for every user-visible
# check, and to the DB directly (psql, same helpers as smoke.sh) only for fixture setup that
# has no frontend path of its own — creating/expiring card-link tokens, and flipping merchant
# B's program status to reach the non-active invite/card-link states. Every section that
# flips state restores it before returning, even when one of its own checks fails: `check()`
# below never exits the script, so the restore statement after a failing check still runs.

set -uo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8788}"
ORIGIN="$BASE_URL" # Astro's built-in CSRF check (security.checkOrigin) requires this on POST

PROGRAM_B="63000000-0000-0000-0000-000000000001"
MEMBER_A="54000000-0000-0000-0000-000000000001"   # seed-member-a@test.pl
MEMBER_B="64000000-0000-0000-0000-000000000001"   # seed-member-b@test.pl
MAYBE_MSG="Jeżeli ten adres należy do programu u tego merchanta, karta pojawi się w Twojej skrzynce e-mail."

# psql_count SQL -- runs a scalar count/select query against the local DB via docker, trimmed
psql_count() {
  docker exec -i supabase_db_backend psql -U postgres -d postgres -tAc "$1" | tr -d '[:space:]'
}

# psql_exec SQL -- runs a statement against the local DB via docker (no output needed)
psql_exec() {
  docker exec -i supabase_db_backend psql -U postgres -d postgres -c "$1" > /dev/null
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

# contains HAYSTACK-FILE NEEDLE -> yes/no. Reads the whole file into one shell variable and
# uses a quoted case-glob rather than grep -c, because Astro's build emits each page as one
# very long line (no pretty-printing) — grep works fine on that too, but this keeps every check
# in this file going through the same tiny primitive as `after_marker` below.
contains() {
  local body
  body=$(cat "$1")
  case "$body" in
    *"$2"*) echo yes ;;
    *) echo no ;;
  esac
}

# after_marker STRING MARKER -> everything in STRING strictly after the first occurrence of
# MARKER. Isolates the join/recovery confirmation panel from ProgramCard's own balance line,
# which always precedes it in document order (ProgramCard, then JoinForm/RecoveryForm) — so a
# check for "no balance in the 202 confirmation" tests the confirmation panel itself, not the
# unrelated, deliberately-unchanged card preview above it (task-9-brief.md: "keep the invite
# page's existing behaviour unchanged" — ProgramCard's placeholder "Saldo 0 pkt" is truthful
# there and out of this task's scope; the confirmation panel itself must still carry none).
after_marker() {
  printf '%s' "${1#*"$2"}"
}

# req_get PATH -> "<body>\n<http_code>"
req_get() {
  curl -s -w '\n%{http_code}' "$BASE_URL$1"
}

# req_get_headers PATH -> raw response headers only
req_get_headers() {
  curl -s -D - -o /dev/null "$BASE_URL$1"
}

# req_post PATH FORM_BODY -> "<body>\n<http_code>". Origin header is required: Astro 5 rejects
# a same-origin POST with no matching Origin as a cross-site form submission (403) otherwise.
req_post() {
  curl -s -X POST -w '\n%{http_code}' -H "Origin: $ORIGIN" -H 'Content-Type: application/x-www-form-urlencoded' \
    -d "$2" "$BASE_URL$1"
}

# ---------------------------------------------------------------------------

invite_tests() {
  echo "== invite page: five GET states =="

  local r body status

  # -- active --
  r=$(req_get "/SEEDA1")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /SEEDA1 (active) status" "$status" "200"
  check "GET /SEEDA1 shows the merchant's brand" "$(contains <(echo "$body") "Seed Salon A")" "yes"

  # -- unknown invite code (not_found) --
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/BOGUS9")
  check "GET /BOGUS9 (not_found) status" "$status" "404"

  # -- unpublished (merchant B flipped to draft) --
  psql_exec "update public.programs set status='draft' where id='$PROGRAM_B';"
  r=$(req_get "/SEEDB1")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /SEEDB1 (unpublished) status" "$status" "200"
  check "GET /SEEDB1 (unpublished) shows the generic unavailable copy" "$(contains <(echo "$body") "niedostępna")" "yes"
  check "GET /SEEDB1 (unpublished) does NOT leak the merchant's brand" "$(contains <(echo "$body") "Seed Kawiarnia B")" "no"

  # -- suspended (same copy as unpublished — indistinguishable by design, task-7-design.md §8) --
  psql_exec "update public.programs set status='suspended' where id='$PROGRAM_B';"
  r=$(req_get "/SEEDB1")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /SEEDB1 (suspended) status" "$status" "200"
  check "GET /SEEDB1 (suspended) same 'niedostępna' copy as unpublished" "$(contains <(echo "$body") "niedostępna")" "yes"

  # -- closed --
  psql_exec "update public.programs set status='closed' where id='$PROGRAM_B';"
  r=$(req_get "/SEEDB1")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /SEEDB1 (closed) status" "$status" "410"
  check "GET /SEEDB1 (closed) copy" "$(contains <(echo "$body") "zakończony")" "yes"

  # restore, unconditionally — reached even if any check above failed, since check() never exits
  psql_exec "update public.programs set status='published' where id='$PROGRAM_B';"
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/SEEDB1")
  check "SEEDB1 restored to published" "$status" "200"
}

join_tests() {
  echo "== join: 201 / 202 / 422 =="

  local email="verify-join-$$@test.pl"
  local r body status

  # -- 201: new member, card comes back --
  r=$(req_post "/SEEDA1" "first_name=Weryfikacja&last_name=Testowa&email=$email&consent=true")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join new email status" "$status" "201"
  check "join new email shows a wallet button" "$(contains <(echo "$body") "Dodaj do Apple Wallet")" "yes"

  # -- 202: same address again — no card, no balance, indistinguishable "maybe" copy --
  r=$(req_post "/SEEDA1" "first_name=Inna&last_name=Osoba&email=$email&consent=true")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join repeat email status" "$status" "202"

  local confirm_tail
  confirm_tail=$(after_marker "$body" "Gotowe.")
  check "join 202 confirmation carries NO wallet link (no 'passkit')" "$(contains <(echo "$confirm_tail") "passkit")" "no"
  check "join 202 confirmation carries NO balance ('pkt')" "$(contains <(echo "$confirm_tail") "pkt")" "no"

  # -- 422: malformed e-mail, value echoed back --
  r=$(req_post "/SEEDA1" "first_name=A&last_name=B&email=not-an-email&consent=true")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "join invalid email status" "$status" "422"
  check "join invalid email value echoed back into the input" "$(contains <(echo "$body") 'value="not-an-email"')" "yes"
}

recovery_tests() {
  echo "== card recovery: 202 x3, byte-identical (anti-enumeration) =="

  local f1 f2 f3 status1 status2 status3

  f1=$(mktemp); f2=$(mktemp); f3=$(mktemp)

  status1=$(curl -s -o "$f1" -w '%{http_code}' -X POST -H "Origin: $ORIGIN" \
    -H 'Content-Type: application/x-www-form-urlencoded' -d "email=seed-member-a@test.pl" "$BASE_URL/SEEDA1?recovery")
  status2=$(curl -s -o "$f2" -w '%{http_code}' -X POST -H "Origin: $ORIGIN" \
    -H 'Content-Type: application/x-www-form-urlencoded' -d "email=seed-member-a@test.pl" "$BASE_URL/SEEDA1?recovery")
  status3=$(curl -s -o "$f3" -w '%{http_code}' -X POST -H "Origin: $ORIGIN" \
    -H 'Content-Type: application/x-www-form-urlencoded' -d "email=nobody-here-$$@test.pl" "$BASE_URL/SEEDA1?recovery")

  check "recovery call 1 (member) status" "$status1" "202"
  check "recovery call 2 (member, likely throttled) status" "$status2" "202"
  check "recovery call 3 (non-member) status" "$status3" "202"

  check "recovery call 1 vs call 2 byte-identical (diff)" "$(diff -q "$f1" "$f2" > /dev/null 2>&1 && echo identical)" "identical"
  check "recovery call 1 vs call 3 byte-identical (diff)" "$(diff -q "$f1" "$f3" > /dev/null 2>&1 && echo identical)" "identical"

  check "recovery confirmation carries NO balance ('pkt') either" \
    "$(contains <(after_marker "$(cat "$f1")" "Gotowe.") "pkt")" "no"

  rm -f "$f1" "$f2" "$f3"
}

card_link_tests() {
  echo "== card-links/:token: ready / preparing / expired / unknown =="

  local status body r

  # -- ready: member A, fresh valid token, program A published — lazy retry (or an
  # -- already-ready pass_status) resolves it to `ready` --
  psql_exec "insert into public.card_link_tokens (member_id, expires_at) values ('$MEMBER_A', now() + interval '24 hours');"
  local token_ready
  token_ready=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' and expires_at > now() order by created_at desc limit 1;")
  r=$(req_get "/card-links/$token_ready")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /card-links (ready) status" "$status" "200"
  check "GET /card-links (ready) shows the merchant's brand" "$(contains <(echo "$body") "Seed Salon A")" "yes"
  check "GET /card-links (ready) shows a wallet button" "$(contains <(echo "$body") "Dodaj do Apple Wallet")" "yes"
  check "GET /card-links (ready) shows NO balance ('pkt') — PassLinks carries none" "$(contains <(echo "$body") "pkt")" "no"

  # -- preparing: member B, fresh valid token, program B temporarily suspended so the lazy
  # -- retry's `program.status !== 'published'` branch fires instead of issuing a pass --
  psql_exec "insert into public.card_link_tokens (member_id, expires_at) values ('$MEMBER_B', now() + interval '24 hours');"
  local token_preparing
  token_preparing=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_B' and expires_at > now() order by created_at desc limit 1;")
  psql_exec "update public.programs set status='suspended' where id='$PROGRAM_B';"
  r=$(req_get "/card-links/$token_preparing")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /card-links (preparing) status" "$status" "200"
  check "GET /card-links (preparing) copy" "$(contains <(echo "$body") "jeszcze przygotowywana")" "yes"
  check "GET /card-links (preparing) retry affordance is a ghost button" "$(contains <(echo "$body") "Sprawdź ponownie")" "yes"
  check "GET /card-links (preparing) has no wallet link yet" "$(contains <(echo "$body") "Dodaj do Apple Wallet")" "no"
  # restored even if a check above failed
  psql_exec "update public.programs set status='published' where id='$PROGRAM_B';"

  # -- expired: member A, token already past expires_at --
  psql_exec "insert into public.card_link_tokens (member_id, expires_at) values ('$MEMBER_A', now() - interval '1 hour');"
  local token_expired
  token_expired=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' and expires_at < now() order by created_at desc limit 1;")
  r=$(req_get "/card-links/$token_expired")
  body=$(echo "$r" | sed '$d'); status=$(echo "$r" | tail -1)
  check "GET /card-links (expired) status" "$status" "410"
  check "GET /card-links (expired) copy" "$(contains <(echo "$body") "stracił ważność")" "yes"
  check "GET /card-links (expired) does NOT leak the merchant's brand (backend sends none)" "$(contains <(echo "$body") "Seed Salon A")" "no"
  check "GET /card-links (expired) links back to the program page" "$(contains <(echo "$body") "/SEEDA1")" "yes"

  # -- unknown token --
  status=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/card-links/totally-unknown-token-$$")
  check "GET /card-links (unknown token) status" "$status" "404"
  body=$(curl -s "$BASE_URL/card-links/totally-unknown-token-$$")
  check "GET /card-links (unknown token) copy" "$(contains <(echo "$body") "Nie rozpoznajemy tego linku")" "yes"
}

header_tests() {
  echo "== security headers =="

  local headers

  headers=$(req_get_headers "/SEEDA1")
  check "GET /SEEDA1 Content-Security-Policy has script-src 'self'" \
    "$(contains <(echo "$headers") "script-src 'self'")" "yes"
  check "GET /SEEDA1 Referrer-Policy" "$(echo "$headers" | grep -i '^referrer-policy:' | tr -d '\r' | awk '{print $2}')" "no-referrer"
  check "GET /SEEDA1 X-Frame-Options" "$(echo "$headers" | grep -i '^x-frame-options:' | tr -d '\r' | awk '{print $2}')" "DENY"
  check "GET /SEEDA1 Cache-Control is the CDN directive (200 GET on the invite route)" \
    "$(echo "$headers" | grep -i '^cache-control:' | tr -d '\r' | tr '[:upper:]' '[:lower:]')" \
    "cache-control: s-maxage=60, stale-while-revalidate=600"

  # card-links/:token is per-customer (token + wallet URLs) and must NEVER be cached by a
  # shared CDN — checked on a 404 AND, crucially, on a real 200 `ready` response: a 404 alone
  # would stay green even if middleware.ts's cache rule were ever generalised from "GET on the
  # invite route" to "any 200 GET" (task-9-design.md §8's named regression) — the 404 never
  # hits the `status === 200` half of that rule either way, only a live 200 exercises it.
  headers=$(req_get_headers "/card-links/no-store-check-$$")
  check "GET /card-links Cache-Control is no-store on a 404" \
    "$(echo "$headers" | grep -i '^cache-control:' | tr -d '\r' | tr '[:upper:]' '[:lower:]')" "cache-control: no-store"

  psql_exec "insert into public.card_link_tokens (member_id, expires_at) values ('$MEMBER_A', now() + interval '24 hours');"
  local token_headers_check
  token_headers_check=$(psql_count "select token from public.card_link_tokens where member_id='$MEMBER_A' and expires_at > now() order by created_at desc limit 1;")
  headers=$(req_get_headers "/card-links/$token_headers_check")
  check "GET /card-links Cache-Control is no-store on a real 200 (ready) response" \
    "$(echo "$headers" | grep -i '^cache-control:' | tr -d '\r' | tr '[:upper:]' '[:lower:]')" "cache-control: no-store"

  local body
  body=$(curl -s "$BASE_URL/SEEDA1")
  check "GET /SEEDA1 body carries noindex" "$(contains <(echo "$body") 'name="robots" content="noindex, nofollow"')" "yes"
}

budget_tests() {
  echo "== payload budget =="

  local size

  size=$(curl -s "$BASE_URL/SEEDA1" | wc -c | tr -d ' ')
  check "GET /SEEDA1 body under 20KB budget" "$([ "$size" -lt 20000 ] && echo yes)" "yes"

  size=$(curl -s "$BASE_URL/BOGUS9" | wc -c | tr -d ' ')
  check "GET /BOGUS9 (panel-only page) body under 10KB budget" "$([ "$size" -lt 10000 ] && echo yes)" "yes"
}

SECTION="${1:-all}"
case "$SECTION" in
  invite) invite_tests ;;
  join) join_tests ;;
  recovery) recovery_tests ;;
  cardlink) card_link_tests ;;
  headers) header_tests ;;
  budget) budget_tests ;;
  all) invite_tests; join_tests; recovery_tests; card_link_tests; header_tests; budget_tests ;;
  *) echo "usage: $0 [invite|join|recovery|cardlink|headers|budget]"; exit 2 ;;
esac

echo
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
