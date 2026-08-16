-- The pass template is what actually carries a merchant's colour and logo onto the card in a
-- customer's phone. Until now we never stored its id: `passkit_template_id` holds the TIER id,
-- which PassKit lets the caller choose and which we always set to the literal 'default' — so it
-- identifies nothing and cannot be used to find the template again.
--
-- The consequence was a silent product hole: a merchant could edit their logo or name after
-- publication, the panel would happily save it, and nothing would ever reach the pass. Publishing
-- again did not help either, because provisioning is deliberately skipped once
-- `passkit_program_id` is set.
--
-- Storing the real template id makes the branding re-syncable (PUT /template, verified live).
alter table public.programs
  add column if not exists passkit_pass_template_id text;

comment on column public.programs.passkit_pass_template_id is
  'PassKit pass template id (Common API). Distinct from passkit_template_id, which holds the tier id.';

-- panel-api writes it during publish, exactly like the other two provisioning columns.
grant update (passkit_pass_template_id) on public.programs to service_role;
