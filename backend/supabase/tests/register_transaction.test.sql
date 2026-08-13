-- register_transaction.test.sql

begin;

-- Merchant A (główny scenariusz)
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-00000000000c', 'c@c.pl');
insert into public.merchants (id, auth_user_id, email)
  values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'c@c.pl');
insert into public.programs (id, merchant_id, status, points_per_pln)
  values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'published', 0.1);
insert into public.members (id, program_id, email, first_name, last_name, consent_at, points_balance)
  values ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
          'k@e.pl', 'K', 'N', now(), 100);
insert into public.members (id, program_id, email, first_name, last_name, consent_at, points_balance)
  values ('c3000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001',
          'blocked@e.pl', 'B', 'N', now(), 50);
insert into public.offers (id, program_id, title)
  values ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Rabat 25%');
insert into public.offers (id, program_id, title)
  values ('c4000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'Rabat dodatkowy');
insert into public.offers (id, program_id, title, status, deactivated_at)
  values ('c4000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'Wycofana', 'inactive', now());
insert into public.offers (id, program_id, title)
  values ('c4000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'Kupon do testu zestawu');
insert into public.offers (id, program_id, title)
  values ('c4000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'Kupon do testu snapshotu');

-- Merchant B (obcy program — test kuponu spoza merchanta)
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-00000000000d', 'd@d.pl');
insert into public.merchants (id, auth_user_id, email)
  values ('d1000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000d', 'd@d.pl');
insert into public.programs (id, merchant_id, status, points_per_pln)
  values ('d2000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'published', 0.2);
insert into public.offers (id, program_id, title)
  values ('d4000000-0000-0000-0000-000000000001', 'd2000000-0000-0000-0000-000000000001', 'Oferta obca');

-- a) CRITICAL: service_role musi mieć EXECUTE na RPC, panel/anon — nie.
do $$
begin
  assert has_function_privilege('service_role',
    'public.register_transaction(uuid,uuid,text,numeric,timestamptz,uuid[],jsonb,boolean)', 'execute'),
    'service_role musi móc wołać register_transaction';
  assert has_function_privilege('service_role', 'public.cancel_transaction(uuid,text)', 'execute'),
    'service_role musi móc wołać cancel_transaction';
  assert not has_function_privilege('authenticated',
    'public.register_transaction(uuid,uuid,text,numeric,timestamptz,uuid[],jsonb,boolean)', 'execute'),
    'panel nie może wołać register_transaction';
  assert not has_function_privilege('anon', 'public.cancel_transaction(uuid,text)', 'execute'),
    'anon nie może wołać cancel_transaction';
  assert not has_function_privilege('service_role',
    'public.transaction_replay_result(public.transactions)', 'execute'),
    'transaction_replay_result nie potrzebuje grantu — działa przez definer w register_transaction';
  assert not has_function_privilege('authenticated',
    'public.transaction_replay_result(public.transactions)', 'execute'),
    'panel nie może wołać transaction_replay_result (forgeable row => cudze saldo)';
end $$;

do $$
declare r jsonb;
begin
  -- 1. naliczenie: 250.00 × 0.1 = 25 pkt, saldo 125
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1001', 250.00, now(), null, null, false);
  assert (r->>'points_awarded')::int = 25, r::text;
  assert (r->>'points_balance')::int = 125, r::text;
  assert (r->>'idempotent_replay')::boolean = false;
  assert (r->>'points_rate_used')::numeric = 0.1, r::text;  -- (j)

  -- 2. idempotencja: replay zwraca pierwotny wynik
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1001', 250.00, now(), null, null, false);
  assert (r->>'idempotent_replay')::boolean = true, r::text;
  assert (r->>'points_balance')::int = 125, 'punkty nie mogą naliczyć się 2×';

  -- 3. idempotency_conflict: ten sam id, inna kwota
  begin
    perform public.register_transaction('c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001', 'TX-1001', 99.00, now(), null, null, false);
    raise exception 'brak idempotency_conflict';
  exception when sqlstate 'LG003' then null;
  end;

  -- 4. zaokrąglenie w dół: 49.99 × 0.1 = 4
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1002', 49.99, now(), null, null, false);
  assert (r->>'points_awarded')::int = 4, r::text;

  -- 5. kupon: konsumpcja atomowa
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1003', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000001']::uuid[], null, false);
  assert r->'coupons'->0->>'status' = 'consumed', r::text;

  -- 6. kupon już zużyty → warning, transakcja przechodzi
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1004', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000001']::uuid[], null, false);
  assert r->'coupons'->0->>'status' = 'already_used', r::text;
  assert jsonb_array_length(r->'warnings') = 1, r::text;

  -- 6b. replay TX-1004 zachowuje kupony i warnings (I4)
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1004', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000001']::uuid[], null, false);
  assert (r->>'idempotent_replay')::boolean = true, r::text;
  assert jsonb_array_length(r->'coupons') = 1, r::text;
  assert jsonb_array_length(r->'warnings') = 1, r::text;

  -- b) multi-coupon all-or-nothing: jedna aktywna, jedna nieaktywna → 0 konsumpcji
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1005', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000002','c4000000-0000-0000-0000-000000000003']::uuid[],
       null, false);
  assert (r->>'points_awarded')::int = 10, r::text;
  assert (select count(*) from public.coupon_redemptions where transaction_id = (r->>'id')::uuid) = 0,
    'all-or-nothing: żaden kupon nie może się skonsumować';
  assert (select e->>'status' from jsonb_array_elements(r->'coupons') e
          where (e->>'coupon_id')::uuid = 'c4000000-0000-0000-0000-000000000003') = 'inactive', r::text;
  assert (select e->>'status' from jsonb_array_elements(r->'coupons') e
          where (e->>'coupon_id')::uuid = 'c4000000-0000-0000-0000-000000000002') = 'blocked_by_other', r::text;

  -- c) duplikat tego samego kuponu w jednym żądaniu → dedup, jedna konsumpcja (nie 23505)
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1006', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000002','c4000000-0000-0000-0000-000000000002']::uuid[],
       null, false);
  assert jsonb_array_length(r->'coupons') = 1, r::text;
  assert r->'coupons'->0->>'status' = 'consumed', r::text;
  assert (select count(*) from public.coupon_redemptions
          where offer_id = 'c4000000-0000-0000-0000-000000000002' and status = 'redeemed') = 1, r::text;

  -- d) kupon obcego merchanta → 'inactive' (nie 'already_used'), transakcja mimo to przechodzi
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1007', 100.00, now(),
       array['d4000000-0000-0000-0000-000000000001']::uuid[], null, false);
  assert (r->>'points_awarded')::int = 10, r::text;
  assert r->'coupons'->0->>'status' = 'inactive', r::text;

  -- f) konflikt gdy performed_at się różni dla tego samego id/member/kwoty
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1008', 100.00, now(), null, null, false);
  begin
    perform public.register_transaction('c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001', 'TX-1008', 100.00, now() - interval '1 hour', null, null, false);
    raise exception 'brak idempotency_conflict dla różnego performed_at';
  exception when sqlstate 'LG003' then null;
  end;

  -- g) performed_at starszy niż historia stawek → sukces (fallback na bieżącą stawkę programu), nie LG005
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1009', 100.00, now() - interval '30 days', null, null, false);
  assert (r->>'points_rate_used')::numeric > 0, r::text;
  assert (r->>'points_awarded')::int = 10, r::text;

  -- h) nulle performed_at/delayed_sync nie wysypują surowego błędu
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1010', 100.00, null, null, null, null);
  assert (r->>'delayed_sync')::boolean = false, r::text;

  -- i) zablokowany członek: transakcja W CHWILI/PO zablokowaniu odrzucona, transakcja SPRZED przechodzi
  update public.members set status = 'blocked', blocked_at = now()
    where id = 'c3000000-0000-0000-0000-000000000002';
  begin
    perform public.register_transaction('c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000002', 'TX-1011', 50.00, now(), null, null, false);
    raise exception 'brak LG004 dla zablokowanego członka';
  exception when sqlstate 'LG004' then null;
  end;
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000002', 'TX-1012', 50.00,
       (select blocked_at from public.members where id = 'c3000000-0000-0000-0000-000000000002') - interval '1 hour',
       null, null, false);
  assert (r->>'points_awarded')::int = 5, r::text;

  -- t1) CRITICAL (round-2 regression, EDIT 1): retry bez performed_at musi
  -- być replayem, nie LG003. Dzięki clock_timestamp() (EDIT 2) każde
  -- wywołanie ma inny "teraz" nawet w tej samej transakcji, więc porównanie
  -- performed_at musi być pominięte, gdy wołający sam go nie podał.
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-NULLRETRY', 100.00, null, null, null, null);
  assert (r->>'idempotent_replay')::boolean = false, r::text;
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-NULLRETRY', 100.00, null, null, null, null);
  assert (r->>'idempotent_replay')::boolean = true,
    'ponowienie bez performed_at musi być replayem, nie LG003: ' || r::text;

  -- t2) I5, druga połowa: powtórzenie z INNYM zestawem kuponów niż oryginał
  -- musi być konfliktem, nie cichą zmianą wyniku.
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-COUPONSET', 100.00, now(), null, null, false);
  begin
    perform public.register_transaction('c2000000-0000-0000-0000-000000000001',
      'c3000000-0000-0000-0000-000000000001', 'TX-COUPONSET', 100.00, now(),
      array['c4000000-0000-0000-0000-000000000004']::uuid[], null, false);
    raise exception 'brak LG003 przy zmienionym zestawie kuponów';
  exception when sqlstate 'LG003' then null;
  end;

  -- t4) decyzja specyfikacyjna: replay po anulowaniu nadal raportuje
  -- 'consumed' — `coupons` to zdjęcie wyniku TEJ rejestracji, nie bieżący
  -- stan kuponu; zwrot widać w `coupons_restored` odpowiedzi cancel_transaction,
  -- a nie tutaj ('reverted' nie istnieje w enumie CouponResult z kontraktu).
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-SNAPSHOT', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000005']::uuid[], null, false);
  assert r->'coupons'->0->>'status' = 'consumed', r::text;
  perform public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-SNAPSHOT');
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-SNAPSHOT', 100.00, now(),
       array['c4000000-0000-0000-0000-000000000005']::uuid[], null, false);
  assert (r->>'idempotent_replay')::boolean = true, r::text;
  assert r->'coupons'->0->>'status' = 'consumed',
    'snapshot: replay po anulowaniu ma nadal pokazywać consumed: ' || r::text;

  -- 7. anulowanie: saldo nie schodzi poniżej zera, korekta
  update public.members set points_balance = 10
    where id = 'c3000000-0000-0000-0000-000000000001';
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1001'); -- naliczyła 25
  assert (r->>'points_reverted')::int = 10, r::text;
  assert (r->>'correction')::int = 15, r::text;
  assert (r->>'points_balance')::int = 0, r::text;

  -- 8. powtórne anulowanie → already_cancelled, bez zmian salda
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1001');
  assert (r->>'already_cancelled')::boolean = true, r::text;
  assert (r->>'points_balance')::int = 0, r::text;

  -- 9. anulowanie nieznanej transakcji → wyjątek LG002
  begin
    perform public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-NOPE');
    raise exception 'brak wyjątku dla nieznanej transakcji';
  exception when sqlstate 'LG002' then null;
  end;

  -- 10. zwrot TX-1003 przywraca kupon (oferta aktywna)
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1003');
  assert jsonb_array_length(r->'coupons_restored') = 1, r::text;
end $$;

-- t3) grants wykonane, nie tylko odczytane: wywołaj RPC jako service_role
-- naprawdę, żeby przećwiczyć cały łańcuch uprawnień, w tym przeskok definer
-- do transaction_replay_result. Savepoint zamiast zagnieżdżonego begin/rollback,
-- bo cały plik już jest w jednej transakcji — set local role jest cofane
-- razem z rollback to savepoint, więc nic nie wycieka do reszty testu.
savepoint sp_role_test;
set local role service_role;
do $$
declare ok jsonb;
declare v_at timestamptz := now();  -- stały punkt w czasie dla obu wywołań, żeby insert i replay to ta sama transakcja
begin
  -- pierwsze wywołanie: gałąź insert
  ok := public.register_transaction('c2000000-0000-0000-0000-000000000001',
        'c3000000-0000-0000-0000-000000000001', 'TX-ROLE', 50.00, v_at, null, null, false);
  assert (ok->>'idempotent_replay')::boolean = false, ok::text;
  -- drugie: gałąź replayu — dowodzi, że service_role przechodzi przez definer
  -- do transaction_replay_result, mimo braku bezpośredniego grantu na ten helper
  ok := public.register_transaction('c2000000-0000-0000-0000-000000000001',
        'c3000000-0000-0000-0000-000000000001', 'TX-ROLE', 50.00, v_at, null, null, false);
  assert (ok->>'idempotent_replay')::boolean = true,
    'service_role musi przejść ścieżkę replayu przez definer: ' || ok::text;
end $$;
rollback to savepoint sp_role_test;

rollback;
