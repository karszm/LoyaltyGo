-- 0004_register_transaction.sql
-- Cała logika w jednej transakcji DB. Kody błędów:
--   P0002 = not found, P0003 = idempotency_conflict, P0004 = member_blocked, P0005 = program_not_active
create or replace function public.register_transaction(
  p_program_id uuid, p_member_id uuid, p_softpos_tx_id text,
  p_amount numeric, p_performed_at timestamptz,
  p_coupon_ids uuid[], p_metadata jsonb, p_delayed_sync boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member members%rowtype;
  v_rate numeric;
  v_points int;
  v_tx transactions%rowtype;
  v_coupons jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_unavailable uuid[] := '{}';
  v_status text;
  c uuid;
  v_offer offers%rowtype;
begin
  -- idempotencja: spróbuj znaleźć istniejącą (blokada wiersza chroni przed wyścigiem)
  select * into v_tx from transactions
   where program_id = p_program_id and softpos_transaction_id = p_softpos_tx_id
   for update;
  if found then
    if v_tx.member_id <> p_member_id or v_tx.amount <> p_amount then
      raise exception 'idempotency conflict' using errcode = 'P0003';
    end if;
    select points_balance into v_points from members where id = v_tx.member_id;
    return jsonb_build_object(
      'id', v_tx.id, 'transaction_id', v_tx.softpos_transaction_id,
      'points_awarded', v_tx.points_awarded, 'points_balance', v_points,
      'points_rate_used', v_tx.points_rate_used,
      'coupons', coalesce((select jsonb_agg(jsonb_build_object('coupon_id', offer_id, 'status', 'consumed'))
                  from coupon_redemptions where transaction_id = v_tx.id), '[]'::jsonb),
      'warnings', '[]'::jsonb, 'idempotent_replay', true, 'delayed_sync', v_tx.delayed_sync);
  end if;

  select * into v_member from members where id = p_member_id and program_id = p_program_id for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  -- blokada: liczy się stan z chwili wykonania transakcji
  if v_member.status = 'blocked' and (v_member.blocked_at is null or p_performed_at >= v_member.blocked_at) then
    raise exception 'membership blocked' using errcode = 'P0004';
  end if;

  v_rate := current_rate(p_program_id, p_performed_at);
  if v_rate is null then raise exception 'program has no rate' using errcode = 'P0005'; end if;
  v_points := floor(p_amount * v_rate);

  insert into transactions (program_id, member_id, softpos_transaction_id, amount,
    points_awarded, points_rate_used, performed_at, delayed_sync, metadata)
  values (p_program_id, p_member_id, p_softpos_tx_id, p_amount,
    v_points, v_rate, p_performed_at, p_delayed_sync, p_metadata)
  returning * into v_tx;

  -- kupony: najpierw sprawdź dostępność WSZYSTKICH (wszystko-albo-nic)
  if p_coupon_ids is not null and array_length(p_coupon_ids, 1) > 0 then
    foreach c in array p_coupon_ids loop
      select * into v_offer from offers where id = c and program_id = p_program_id for update;
      if not found or v_offer.status <> 'active' then
        v_unavailable := v_unavailable || c;
      elsif exists (select 1 from coupon_redemptions
                    where offer_id = c and member_id = p_member_id and status = 'redeemed') then
        v_unavailable := v_unavailable || c;
      end if;
    end loop;

    foreach c in array p_coupon_ids loop
      if array_length(v_unavailable, 1) > 0 then
        -- żaden nie jest konsumowany; nazwij powód per kupon
        if c = any(v_unavailable) then
          select * into v_offer from offers where id = c;
          v_status := case
            when v_offer.id is null or v_offer.status <> 'active' then 'inactive'
            else 'already_used' end;
        else
          v_status := 'blocked_by_other';
        end if;
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

  update members set points_balance = points_balance + v_points, last_transaction_at = p_performed_at
   where id = p_member_id returning points_balance into v_points;

  return jsonb_build_object(
    'id', v_tx.id, 'transaction_id', p_softpos_tx_id,
    'points_awarded', v_tx.points_awarded, 'points_balance', v_points,
    'points_rate_used', v_tx.points_rate_used,
    'coupons', v_coupons, 'warnings', v_warnings,
    'idempotent_replay', false, 'delayed_sync', p_delayed_sync);
end $$;

create or replace function public.cancel_transaction(p_program_id uuid, p_softpos_tx_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tx transactions%rowtype;
  v_balance int; v_revert int; v_correction int;
  v_restored jsonb;
begin
  select * into v_tx from transactions
   where program_id = p_program_id and softpos_transaction_id = p_softpos_tx_id for update;
  if not found then raise exception 'transaction unknown' using errcode = 'P0002'; end if;

  if v_tx.status = 'cancelled' then
    select points_balance into v_balance from members where id = v_tx.member_id;
    return jsonb_build_object('id', v_tx.id, 'transaction_id', p_softpos_tx_id,
      'status', 'cancelled', 'points_reverted', v_tx.points_reverted,
      'correction', coalesce(v_tx.correction, 0), 'points_balance', v_balance,
      'coupons_restored', '[]'::jsonb, 'already_cancelled', true);
  end if;

  select points_balance into v_balance from members where id = v_tx.member_id for update;
  v_revert := least(v_tx.points_awarded, v_balance);
  v_correction := v_tx.points_awarded - v_revert;

  update members set points_balance = points_balance - v_revert
   where id = v_tx.member_id returning points_balance into v_balance;
  update transactions set status = 'cancelled', points_reverted = v_revert, correction = v_correction
   where id = v_tx.id;

  -- kupon wraca do puli tylko gdy oferta nadal aktywna
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

-- Funkcje wołane wyłącznie przez Edge (service role) — odbierz wykonanie pozostałym.
revoke execute on function public.register_transaction(uuid,uuid,text,numeric,timestamptz,uuid[],jsonb,boolean) from public, anon, authenticated;
revoke execute on function public.cancel_transaction(uuid,text) from public, anon, authenticated;
