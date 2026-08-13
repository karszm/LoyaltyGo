-- 0006_program_status_history.sql
-- 1) Kiedy program zmienił stan. Do tej pory Edge używał `programs.updated_at`
--    jako przybliżenia momentu zawieszenia, ale updated_at rusza KAŻDA zmiana
--    programu (np. edycja koloru karty) — po takiej edycji transakcja offline
--    wykonana PO zawieszeniu znów mieściła się pod progiem i naliczała punkty
--    na zawieszonym programie. Trigger, nie handler: żaden endpoint nie może
--    zapomnieć go ustawić.
alter table public.programs
  add column if not exists status_changed_at timestamptz not null default now();

create or replace function public.programs_touch_status_changed_at() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end $$;

create trigger programs_touch_status_changed_at
  before update on public.programs
  for each row execute function public.programs_touch_status_changed_at();

-- Górna granica przelicznika. Bez niej panel może ustawić 9999.9999 pkt/zł,
-- co przy dopuszczalnej kwocie przepełnia points_awarded (int4) i zamienia
-- błąd wejścia w 500. 100 pkt za złotówkę to i tak skrajność biznesowa.
alter table public.programs
  add constraint programs_points_per_pln_max check (points_per_pln <= 100);

-- 2) Odrzucenia synchronizacji offline muszą być idempotentne: ponowienie
--    partii z kolejki to normalny przypadek, a nie wyjątek, więc bez tego
--    lista odrzuceń w panelu zapełnia się duplikatami tej samej transakcji.
create unique index if not exists sync_rejections_dedup
  on public.sync_rejections (program_id, softpos_transaction_id)
  where softpos_transaction_id is not null;
