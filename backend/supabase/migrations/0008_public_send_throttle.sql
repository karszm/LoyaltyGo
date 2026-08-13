-- 0008_public_send_throttle.sql
-- Limiter wysyłki dla powierzchni publicznej. Kluczem jest HASH (program + adres),
-- nie member_id: limiter oparty na członkostwie sam w sobie zdradzał, czy adres
-- należy do programu (dwa żądania = odpowiedź tak/nie). Hash z pepperem, żeby
-- nie trzymać adresów osób, które do programu nie należą.
create table public.public_send_throttle (
  key_hash text primary key,
  last_sent_at timestamptz not null default now()
);

alter table public.public_send_throttle enable row level security;
-- brak polityk = niedostępne dla anon i authenticated; tylko service_role (Edge).

-- Atomiczne "czy mogę teraz wysłać": jeden statement (insert ... on conflict do update
-- ... where ... returning), więc dwa równoległe wywołania dla tego samego klucza nie mogą
-- oba wygrać wyścigu. Gdy WHERE nie przejdzie (ostatnia wysyłka za świeża), UPDATE nie
-- rusza wiersza i RETURNING nie zwraca nic -> funkcja SQL zwraca NULL (traktowane jak
-- false przez wołającego), zamiast wykonać drugą wysyłkę równolegle z pierwszą.
create or replace function public.public_send_throttle_try(p_key_hash text, p_window_seconds int)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  insert into public.public_send_throttle (key_hash, last_sent_at)
  values (p_key_hash, now())
  on conflict (key_hash) do update
    set last_sent_at = now()
    where public.public_send_throttle.last_sent_at < now() - (p_window_seconds || ' seconds')::interval
  returning true
$$;

revoke execute on function public.public_send_throttle_try(text, int) from public, anon, authenticated;
grant execute on function public.public_send_throttle_try(text, int) to service_role;
grant select, insert, update on public.public_send_throttle to service_role;
