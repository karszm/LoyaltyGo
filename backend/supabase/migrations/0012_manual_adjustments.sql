-- 0012_manual_adjustments.sql
-- Ręczna korekta punktów z panelu merchanta (+12 / -30 z opisem usługi).
--
-- Korekta jest wierszem w `transactions`, nie osobną tabelą: /transakcje i szczegóły
-- klienta czytają JEDNĄ historię jednym zapytaniem, a syncPassBalance (saldo na karcie
-- w portfelu) działa bez zmian. Cena: kolumny skrojone pod SoftPOS przestają być
-- `not null` i spójności pilnuje check `transactions_source_shape` niżej.
--
-- Kody błędów w prywatnej klasie LG (patrz 0004): LG002 = not found (reużyty),
-- LG006 = invalid adjustment (delta 0 / brak opisu — panel-api waliduje to samo
-- wcześniej, tu obrona w głębi), LG007 = insufficient balance (saldo w DETAIL).

alter table public.transactions
  alter column softpos_transaction_id drop not null,
  alter column amount drop not null,
  alter column points_rate_used drop not null,
  add column source text not null default 'softpos'
    check (source in ('softpos', 'manual')),
  add column description text check (char_length(description) <= 200);

-- Wiersz z kasy ma identyfikator, kwotę i stawkę, a nie ma opisu; korekta ręczna
-- dokładnie odwrotnie. Nic pomiędzy. Istniejące checki (amount > 0, softpos_transaction_id
-- <> '') przepuszczają null, więc zostają nietknięte i dalej pilnują wierszy z kasy.
alter table public.transactions
  add constraint transactions_source_shape check (
    (source = 'softpos'
      and softpos_transaction_id is not null
      and amount is not null
      and points_rate_used is not null
      and description is null)
    or
    (source = 'manual'
      and softpos_transaction_id is null
      and amount is null
      and points_rate_used is null
      and description is not null)
  );

-- Unikalność idempotencji (program_id, softpos_transaction_id) działa dalej: null nie
-- wchodzi do unique, więc korekty ręczne nigdy się o nią nie potkną.

-- Korekta salda w jednej transakcji DB: blokada wiersza członka, kontrola salda PRZED
-- update (check points_balance >= 0 i tak by zablokował, ale 23514 nie niesie salda,
-- a komunikat panelu musi powiedzieć "klient ma tylko N punktów"), wpis do historii.
--
-- Celowo NIE dotyka members.last_transaction_at: to znacznik ostatniego zakupu na kasie
-- (lista klientów obiecuje "Ostatnia transakcja"), a korekta zakupem nie jest.
-- Celowo NIE sprawdza statusu programu ani blokady członka: zawieszenie programu
-- blokuje terminal, nie merchanta w jego własnym panelu, a korekta u zablokowanego
-- klienta (np. wycofanie punktów przed odblokowaniem) jest świadomą czynnością merchanta.
create or replace function public.adjust_points(
  p_program_id uuid, p_member_id uuid, p_delta int, p_description text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_member members%rowtype;
  v_balance int;
  v_tx_id uuid;
  v_description text := btrim(coalesce(p_description, ''));
begin
  if p_delta is null or p_delta = 0 then
    raise exception 'delta must be a non-zero integer' using errcode = 'LG006';
  end if;
  if v_description = '' or char_length(v_description) > 200 then
    raise exception 'description required, at most 200 characters' using errcode = 'LG006';
  end if;

  select * into v_member from members
   where id = p_member_id and program_id = p_program_id for update;
  if not found then raise exception 'member not found' using errcode = 'LG002'; end if;

  if v_member.points_balance + p_delta < 0 then
    -- Aktualne saldo w DETAIL: panel-api czyta je z error.details i buduje komunikat.
    raise exception 'insufficient balance' using errcode = 'LG007',
      detail = v_member.points_balance::text;
  end if;

  insert into transactions (program_id, member_id, source, points_awarded,
    performed_at, description)
  values (p_program_id, p_member_id, 'manual', p_delta, clock_timestamp(), v_description)
  returning id into v_tx_id;

  update members set points_balance = points_balance + p_delta
   where id = p_member_id returning points_balance into v_balance;

  return jsonb_build_object(
    'id', v_tx_id, 'points_delta', p_delta, 'points_balance', v_balance);
end $$;

-- Wywoływane wyłącznie przez panel-api (service role) — jak RPC z 0004.
revoke execute on function public.adjust_points(uuid,uuid,int,text) from public, anon, authenticated;
grant execute on function public.adjust_points(uuid,uuid,int,text) to service_role;
