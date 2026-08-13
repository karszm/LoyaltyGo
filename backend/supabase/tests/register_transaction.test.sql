-- register_transaction.test.sql
begin;
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-00000000000c', 'c@c.pl');
insert into public.merchants (id, auth_user_id, email)
  values ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'c@c.pl');
insert into public.programs (id, merchant_id, status, points_per_pln)
  values ('c2000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'published', 0.1);
insert into public.members (id, program_id, email, first_name, last_name, consent_at, points_balance)
  values ('c3000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001',
          'k@e.pl', 'K', 'N', now(), 100);
insert into public.offers (id, program_id, title)
  values ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Rabat 25%');

do $$
declare r jsonb;
begin
  -- 1. naliczenie: 250.00 × 0.1 = 25 pkt, saldo 125
  r := public.register_transaction('c2000000-0000-0000-0000-000000000001',
       'c3000000-0000-0000-0000-000000000001', 'TX-1001', 250.00, now(), null, null, false);
  assert (r->>'points_awarded')::int = 25, r::text;
  assert (r->>'points_balance')::int = 125, r::text;
  assert (r->>'idempotent_replay')::boolean = false;

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
  exception when sqlstate 'P0003' then null;
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

  -- 9. anulowanie nieznanej transakcji → wyjątek P0002
  begin
    perform public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-NOPE');
    raise exception 'brak wyjątku dla nieznanej transakcji';
  exception when sqlstate 'P0002' then null;
  end;

  -- 10. zwrot TX-1003 przywraca kupon (oferta aktywna)
  r := public.cancel_transaction('c2000000-0000-0000-0000-000000000001', 'TX-1003');
  assert jsonb_array_length(r->'coupons_restored') = 1, r::text;
end $$;
rollback;
