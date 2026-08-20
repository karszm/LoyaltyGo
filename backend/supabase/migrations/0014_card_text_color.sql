-- 0014_card_text_color.sql
--
-- Kolor napisów na karcie. Do tej pory był zabetonowany na biały — w podglądzie
-- (CARD_INK) i w szablonie PassKita (labelColor/textColor). To była NASZA
-- decyzja, nie ograniczenie Apple'a: `colors.labelColor` i `colors.textColor` są
-- zwykłymi polami szablonu. Sprawdzone wykonaniem 2026-08-20 — karta w kolorze
-- #f5f0e8 z czarnym tekstem przechodzi i utrzymuje się w readbacku
-- (docs/passkit-live-findings.md §10).
--
-- Dwie wartości, nie dowolny kolor. Merchant wybiera stronę, nie odcień: pass
-- rysuje jednym kolorem etykiety i wartości, a trzeci odcień to tylko nowy
-- sposób na kartę, której nie da się przeczytać.
alter table public.programs
  add column text_color text not null default '#ffffff'
    constraint programs_text_color_check check (text_color in ('#ffffff', '#000000'));

comment on column public.programs.text_color is
  'Kolor napisów na karcie: #ffffff albo #000000. Trafia do colors.labelColor i colors.textColor w PassKicie.';

-- Domyślnie biały, więc każdy istniejący program wygląda dokładnie tak jak
-- przed tą migracją. Nikomu karta nie zmieni się pod ręką.

-- Pole formularza jak background_color, więc ten sam grant co tam (0003).
grant update (text_color) on public.programs to authenticated;
