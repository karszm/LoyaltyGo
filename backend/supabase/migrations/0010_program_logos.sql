-- 0010_program_logos.sql
--
-- Storage bucket for program logos, scoped per-merchant by folder. The panel
-- uploads straight to Storage (no Edge route: PostgREST can't take
-- multipart/form-data) and then does `update programs set logo_url = ...`,
-- already granted to `authenticated` by 0003.
--
-- Public read: PassKit fetches logo_url server-side (no auth header of ours to
-- give it) and the future public program page renders it directly — both need
-- an unauthenticated GET.
--
-- allowed_mime_types deliberately excludes image/svg+xml: an SVG served
-- inline from the storage origin can carry <script>, i.e. XSS. Wallet cards
-- need a raster anyway, so PNG/JPEG/WEBP cover the real use case.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('program-logos', 'program-logos', true, 1048576,
        array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by the storage extension itself
-- (verified on the local stack; no `alter table` needed here).
--
-- The first path segment is the tenant boundary: the panel must upload to
-- `<merchant_id>/logo-<timestamp>.png`, never to the bucket root. Same
-- predicate as every other panel policy (public.my_merchant_id(), from 0003).
--
-- `name !~ '(^|/)\.\.(/|$)'` rejects any path segment equal to `..`. Without
-- it, `A/../B/x.png` satisfies the folder predicate at the SQL level (its
-- first token is `A`); it's a no-op today only because the HTTP router
-- normalises the path before this insert runs and the storage backend itself
-- rejects dot segments. Two upstream guards this policy doesn't control —
-- so it enforces its own boundary instead of trusting them.
create policy program_logos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'program-logos'
    and (storage.foldername(name))[1] = public.my_merchant_id()::text
    and name !~ '(^|/)\.\.(/|$)'
  );

-- No UPDATE policy. Postgres applies a table's SELECT policies (not the
-- UPDATE policy's own USING clause in isolation) to decide which rows an
-- UPDATE's WHERE clause can even see, and `authenticated` has no SELECT
-- policy on storage.objects — so an UPDATE policy here could never match a
-- row, including the merchant's own. It would read as protection that isn't
-- there. The panel doesn't need it anyway: there's no DELETE policy either,
-- so a key can't be freed up for reuse, and the design is one fresh key per
-- upload (`logo-<timestamp>.png`), never an overwrite. If listing/updating a
-- merchant's own objects is ever needed, add `for select to authenticated`
-- with the same folder predicate *and* reinstate this update policy together
-- — one without the other is the broken state this comment is replacing.

-- No DELETE policy, on purpose. The panel names each new upload
-- logo-<timestamp>.png rather than overwriting, so an old logo can never be
-- yanked out from under a pass that still points at it — the panel just
-- rewrites programs.logo_url to the new object and the old one goes stale.
-- ponytail: unbounded storage growth, a few KB/merchant/upload — fine for the
-- PoC. Cleanup path: a batch job that deletes objects not referenced by any
-- programs.logo_url, added post-PoC if a merchant's storage actually grows.
