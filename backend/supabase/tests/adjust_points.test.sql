-- adjust_points.test.sql — ręczna korekta punktów (migracja 0012)

begin;

insert into auth.users (id, email) values ('e0000000-0000-0000-0000-00000000000e', 'e@e.pl');
insert into public.merchants (id, auth_user_id, email)
  values ('e1000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000000e', 'e@e.pl');
insert into public.programs (id, merchant_id, status, points_per_pln)
  values ('e2000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000001', 'published', 0.1);
insert into public.members (id, program_id, email, first_name, last_name, consent_at, points_balance)
  values ('e3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001',
          'k@e.pl', 'K', 'N', now(), 20);

-- Obcy program — korekta u cudzego członka musi dostać LG002.
insert into auth.users (id, email) values ('f0000000-0000-0000-0000-00000000000f', 'f@f.pl');
insert into public.merchants (id, auth_user_id, email)
  values ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000f', 'f@f.pl');
insert into public.programs (id, merchant_id, status, points_per_pln)
  values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'published', 0.1);

-- a) granty: service_role tak, panel/anon nie
do $$
begin
  assert has_function_privilege('service_role', 'public.adjust_points(uuid,uuid,int,text)', 'execute'),
    'service_role musi móc wołać adjust_points';
  assert not has_function_privilege('authenticated', 'public.adjust_points(uuid,uuid,int,text)', 'execute'),
    'panel nie może wołać adjust_points wprost — tylko przez panel-api';
  assert not has_function_privilege('anon', 'public.adjust_points(uuid,uuid,int,text)', 'execute'),
    'anon nie może wołać adjust_points';
end $$;

-- b) korekta dodatnia: saldo rośnie, wiersz manual w historii, last_transaction_at nietknięte
do $$
declare ok jsonb; v_last timestamptz;
begin
  select last_transaction_at into v_last from members where id = 'e3000000-0000-0000-0000-000000000001';
  ok := public.adjust_points('e2000000-0000-0000-0000-000000000001',
        'e3000000-0000-0000-0000-000000000001', 12, 'premia za polecenie');
  assert (ok->>'points_balance')::int = 32, ok::text;
  assert (ok->>'points_delta')::int = 12, ok::text;
  assert (select points_balance from members where id = 'e3000000-0000-0000-0000-000000000001') = 32,
    'saldo w bazie musi urosnąć o 12';
  assert (select count(*) from transactions
           where member_id = 'e3000000-0000-0000-0000-000000000001'
             and source = 'manual' and points_awarded = 12
             and description = 'premia za polecenie'
             and softpos_transaction_id is null and amount is null) = 1,
    'korekta musi zostawić dokładnie jeden wiersz manual';
  assert (select last_transaction_at from members
           where id = 'e3000000-0000-0000-0000-000000000001') is not distinct from v_last,
    'korekta nie jest zakupem — last_transaction_at zostaje';
end $$;

-- c) korekta ujemna w granicach salda
do $$
declare ok jsonb;
begin
  ok := public.adjust_points('e2000000-0000-0000-0000-000000000001',
        'e3000000-0000-0000-0000-000000000001', -30, 'wykorzystanie punktów');
  assert (ok->>'points_balance')::int = 2, ok::text;
end $$;

-- d) korekta poniżej zera: LG007 z saldem w DETAIL, saldo nietknięte
do $$
declare v_detail text;
begin
  begin
    perform public.adjust_points('e2000000-0000-0000-0000-000000000001',
            'e3000000-0000-0000-0000-000000000001', -3, 'za dużo');
    raise exception 'korekta poniżej zera musiała rzucić LG007';
  exception when sqlstate 'LG007' then
    get stacked diagnostics v_detail = pg_exception_detail;
    assert v_detail = '2', 'DETAIL musi nieść aktualne saldo, dostał: ' || coalesce(v_detail, '<null>');
  end;
  assert (select points_balance from members where id = 'e3000000-0000-0000-0000-000000000001') = 2,
    'odmowa nie może ruszyć salda';
end $$;

-- e) walidacja: delta 0 i pusty opis -> LG006
do $$
begin
  begin
    perform public.adjust_points('e2000000-0000-0000-0000-000000000001',
            'e3000000-0000-0000-0000-000000000001', 0, 'opis');
    raise exception 'delta 0 musiała rzucić LG006';
  exception when sqlstate 'LG006' then null;
  end;
  begin
    perform public.adjust_points('e2000000-0000-0000-0000-000000000001',
            'e3000000-0000-0000-0000-000000000001', 5, '   ');
    raise exception 'pusty opis musiał rzucić LG006';
  exception when sqlstate 'LG006' then null;
  end;
end $$;

-- f) izolacja: członek spoza programu wołającego -> LG002
do $$
begin
  begin
    perform public.adjust_points('f2000000-0000-0000-0000-000000000001',
            'e3000000-0000-0000-0000-000000000001', 5, 'cudzy klient');
    raise exception 'cudzy członek musiał rzucić LG002';
  exception when sqlstate 'LG002' then null;
  end;
end $$;

-- g) transactions_source_shape: hybryda softpos/manual nie ma prawa wejść
do $$
begin
  begin
    insert into transactions (program_id, member_id, source, points_awarded, performed_at,
      description, softpos_transaction_id, amount, points_rate_used)
    values ('e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
      'manual', 5, now(), 'hybryda', 'TX-HYBRID', 10.00, 0.1);
    raise exception 'wiersz manual z identyfikatorem kasy musiał naruszyć transactions_source_shape';
  exception when check_violation then null;
  end;
  begin
    insert into transactions (program_id, member_id, source, points_awarded, performed_at)
    values ('e2000000-0000-0000-0000-000000000001', 'e3000000-0000-0000-0000-000000000001',
      'softpos', 5, now());
    raise exception 'wiersz softpos bez identyfikatora i kwoty musiał naruszyć transactions_source_shape';
  exception when check_violation then null;
  end;
end $$;

rollback;
