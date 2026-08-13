-- 0004_register_transaction.sql
-- Cała logika rejestracji i anulowania w jednej transakcji DB.
-- Kody błędów w prywatnej klasie LG (wbudowane P000x są zajęte: P0004 =
-- assert_failure jest NIEprzechwytywalne przez WHEN OTHERS, P0002/P0003 to
-- no_data_found/too_many_rows):
--   LG002 = not found, LG003 = idempotency_conflict,
--   LG004 = member_blocked, LG005 = program_not_active

-- Wyniki kuponów i ostrzeżenia muszą przetrwać do replayu: SoftPOS ponawia
-- rejestrację i kasjer musi dostać ten sam komunikat co pierwotnie.
alter table public.transactions
  add column if not exists coupon_results jsonb not null default '[]'::jsonb,
  add column if not exists warnings jsonb not null default '[]'::jsonb;

-- Wynik pierwotnej rejestracji — wspólny dla pre-checku idempotencji i dla
-- wyścigu przechwyconego przez on conflict.
create or replace function public.transaction_replay_result(p_tx public.transactions)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', p_tx.id,
    'transaction_id', p_tx.softpos_transaction_id,
    'points_awarded', p_tx.points_awarded,
    'points_balance', (select points_balance from public.members where id = p_tx.member_id),
    'points_rate_used', p_tx.points_rate_used,
    'coupons', p_tx.coupon_results,
    'warnings', p_tx.warnings,
    'idempotent_replay', true,
    'delayed_sync', p_tx.delayed_sync)
$$;

-- Normalizacja listy kuponów: dedup chroni przed 23505 na coupon_one_per_member
-- przy podwójnym tapnięciu w SoftPOS, sort ustala globalny porządek blokowania
-- ofert (bez tego dwa równoległe żądania z odwróconymi listami się zakleszczają).
create or replace function public.normalize_coupon_ids(p_ids uuid[])
returns uuid[] language sql immutable as $$
  select coalesce((select array_agg(distinct c order by c) from unnest(p_ids) as c), '{}'::uuid[])
$$;

create or replace function public.register_transaction(
  p_program_id uuid, p_member_id uuid, p_softpos_tx_id text,
  p_amount numeric, p_performed_at timestamptz,
  p_coupon_ids uuid[], p_metadata jsonb, p_delayed_sync boolean
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_member members%rowtype;
  v_offer offers%rowtype;
  v_tx transactions%rowtype;
  v_rate numeric;
  v_points int;
  v_balance int;
  v_coupons jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_reason jsonb := '{}'::jsonb;          -- coupon_id::text -> 'inactive' | 'already_used'
  v_any_bad boolean;
  v_performed_at timestamptz := coalesce(p_performed_at, now());
  v_delayed boolean := coalesce(p_delayed_sync, false);
  v_ids uuid[] := public.normalize_coupon_ids(p_coupon_ids);
  v_status text;
  c uuid;
begin
  -- Idempotencja po (program_id, softpos_transaction_id). Pre-check łapie
  -- ponowienie sekwencyjne; równoległy wyścig łapie on conflict niżej.
  select * into v_tx from transactions
   where program_id = p_program_id and softpos_transaction_id = p_softpos_tx_id;
  if found then
    if v_tx.member_id <> p_member_id
       or v_tx.amount <> p_amount
       or v_tx.performed_at <> v_performed_at
       or v_ids <> public.normalize_coupon_ids(
            (select array_agg((e->>'coupon_id')::uuid)
               from jsonb_array_elements(v_tx.coupon_results) e))
    then
      raise exception 'idempotency conflict' using errcode = 'LG003';
    end if;
    return public.transaction_replay_result(v_tx);
  end if;

  select * into v_member from members
   where id = p_member_id and program_id = p_program_id for update;
  if not found then raise exception 'member not found' using errcode = 'LG002'; end if;
  -- Blokada członka liczy się wg stanu z chwili WYKONANIA transakcji:
  -- wpis z kolejki offline sprzed blokady musi przejść.
  if v_member.status = 'blocked'
     and (v_member.blocked_at is null or v_performed_at >= v_member.blocked_at) then
    raise exception 'membership blocked' using errcode = 'LG004';
  end if;

  -- Stawka z chwili wykonania. Gdy transakcja jest starsza niż historia stawek
  -- (zegar kasy, sync offline sprzed publikacji) — bieżąca stawka programu.
  v_rate := coalesce(public.current_rate(p_program_id, v_performed_at),
                     (select points_per_pln from programs where id = p_program_id));
  if v_rate is null then raise exception 'program not active' using errcode = 'LG005'; end if;
  v_points := floor(p_amount * v_rate);

  insert into transactions (program_id, member_id, softpos_transaction_id, amount,
    points_awarded, points_rate_used, performed_at, delayed_sync, metadata)
  values (p_program_id, p_member_id, p_softpos_tx_id, p_amount,
    v_points, v_rate, v_performed_at, v_delayed, p_metadata)
  on conflict (program_id, softpos_transaction_id) do nothing
  returning * into v_tx;

  -- Równoległa sesja zarejestrowała tę transakcję między pre-checkiem a insertem.
  -- Wejście rekurencyjne trafi w gałąź replayu (albo wstawi, jeśli tamta sesja
  -- się wycofała) — zamiast surowego 23505.
  if not found then
    return public.register_transaction(p_program_id, p_member_id, p_softpos_tx_id,
      p_amount, v_performed_at, v_ids, p_metadata, v_delayed);
  end if;

  -- Kupony. Pass 1: ustal dostępność WSZYSTKICH (blokada wiersza oferty w
  -- ustalonym porządku). Pass 2: konsumuj tylko gdy wszystkie dostępne.
  if array_length(v_ids, 1) > 0 then
    foreach c in array v_ids loop
      select * into v_offer from offers
       where id = c and program_id = p_program_id for update;
      if not found or v_offer.status <> 'active' then
        v_reason := v_reason || jsonb_build_object(c::text, 'inactive');
      elsif exists (select 1 from coupon_redemptions
                    where offer_id = c and member_id = p_member_id and status = 'redeemed') then
        v_reason := v_reason || jsonb_build_object(c::text, 'already_used');
      end if;
    end loop;
    v_any_bad := v_reason <> '{}'::jsonb;

    foreach c in array v_ids loop
      if v_any_bad then
        v_status := coalesce(v_reason ->> c::text, 'blocked_by_other');
      else
        insert into coupon_redemptions (offer_id, member_id, transaction_id)
        values (c, p_member_id, v_tx.id);
        v_status := 'consumed';
      end if;
      v_coupons := v_coupons || jsonb_build_object('coupon_id', c, 'status', v_status);
      if v_status in ('inactive','already_used') then
        v_warnings := v_warnings || jsonb_build_object(
          'code', 'coupon_' || v_status,
          'message', 'Kupon nieskonsumowany — rabat udzielony poza programem.');
      end if;
    end loop;
  end if;

  update transactions set coupon_results = v_coupons, warnings = v_warnings
   where id = v_tx.id;

  update members set points_balance = points_balance + v_points,
                     last_transaction_at = v_performed_at
   where id = p_member_id returning points_balance into v_balance;

  return jsonb_build_object(
    'id', v_tx.id, 'transaction_id', p_softpos_tx_id,
    'points_awarded', v_points, 'points_balance', v_balance,
    'points_rate_used', v_rate,
    'coupons', v_coupons, 'warnings', v_warnings,
    'idempotent_replay', false, 'delayed_sync', v_delayed);
end $$;

create or replace function public.cancel_transaction(p_program_id uuid, p_softpos_tx_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tx transactions%rowtype;
  v_balance int; v_revert int; v_correction int;
  v_restored jsonb;
begin
  select * into v_tx from transactions
   where program_id = p_program_id and softpos_transaction_id = p_softpos_tx_id for update;
  if not found then raise exception 'transaction unknown' using errcode = 'LG002'; end if;

  if v_tx.status = 'cancelled' then
    select points_balance into v_balance from members where id = v_tx.member_id;
    return jsonb_build_object('id', v_tx.id, 'transaction_id', p_softpos_tx_id,
      'status', 'cancelled', 'points_reverted', v_tx.points_reverted,
      'correction', coalesce(v_tx.correction, 0), 'points_balance', v_balance,
      'coupons_restored', '[]'::jsonb, 'already_cancelled', true);
  end if;

  select points_balance into v_balance from members where id = v_tx.member_id for update;
  -- Saldo nigdy poniżej zera (check w DB): clamp PRZED update, resztę zapisz
  -- jako korektę.
  v_revert := least(v_tx.points_awarded, v_balance);
  v_correction := v_tx.points_awarded - v_revert;

  update members set points_balance = points_balance - v_revert
   where id = v_tx.member_id returning points_balance into v_balance;
  update transactions set status = 'cancelled', points_reverted = v_revert, correction = v_correction
   where id = v_tx.id;

  -- Kupon wraca do puli tylko gdy jego oferta jest nadal aktywna. Kupon
  -- z oferty zdezaktywowanej po transakcji zostaje 'redeemed' — świadomie,
  -- zgodnie z kontraktem (klient nie odzyskuje kuponu do wycofanej oferty).
  with restored as (
    update coupon_redemptions r set status = 'reverted', reverted_at = now()
    from offers o
    where r.transaction_id = v_tx.id and r.status = 'redeemed'
      and o.id = r.offer_id and o.status = 'active'
    returning r.offer_id
  ) select coalesce(jsonb_agg(offer_id), '[]'::jsonb) into v_restored from restored;

  return jsonb_build_object('id', v_tx.id, 'transaction_id', p_softpos_tx_id,
    'status', 'cancelled', 'points_reverted', v_revert, 'correction', v_correction,
    'points_balance', v_balance, 'coupons_restored', v_restored, 'already_cancelled', false);
end $$;

-- Wywoływane wyłącznie przez Edge Functions (service role). Panel i anon nie
-- mają wstępu; brak jawnego grantu dla service_role = RPC nie działa wcale.
revoke execute on function public.register_transaction(uuid,uuid,text,numeric,timestamptz,uuid[],jsonb,boolean) from public, anon, authenticated;
revoke execute on function public.cancel_transaction(uuid,text) from public, anon, authenticated;
revoke execute on function public.transaction_replay_result(public.transactions) from public, anon, authenticated;
revoke execute on function public.normalize_coupon_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.register_transaction(uuid,uuid,text,numeric,timestamptz,uuid[],jsonb,boolean) to service_role;
grant execute on function public.cancel_transaction(uuid,text) to service_role;
