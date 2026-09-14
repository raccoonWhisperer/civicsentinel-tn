-- =====================================================================
-- CIVIC SENTINEL — 2026-09-14 hotfix: restore public read access
-- Project: mbdyzhaahhwozvsjsltr. Run in Supabase → SQL Editor → Run.
-- Idempotent; safe to re-run.
--
-- SYMPTOM  Live site shows "0 issues logged" and an empty log. Console:
--          GET /rest/v1/issue_events  → 401 {"code":"42501",
--          "message":"permission denied for table issues"}
--          GET /rest/v1/issue_sources → 401 (same)
--          GET /rest/v1/issues_public → 200 (33 rows — the data is intact)
--
-- CAUSE    `anon` has NO SELECT privilege on public.issues (not even `id`).
--          The RLS policies on issue_events / issue_sources contain
--          `exists (select 1 from public.issues i where i.id = issue_id
--                   and i.moderation = 'published')`
--          which runs as the caller, so every read of those two tables
--          fails. issues_public still works only because that view was
--          created WITHOUT security_invoker (it runs as its owner).
--          i.e. the "revoke all on public.issues from anon" half of the
--          privacy hardening was applied, the column-level re-grant was not.
--
-- FIX      Re-grant SELECT on the SAFE columns only (reporter_contact and
--          reporter_name stay unreadable), confirm the side-table grants and
--          policies, and rebuild issues_public as security_invoker so the
--          column grants + RLS govern every path.
-- =====================================================================

-- 1. Column-level read on issues for the public roles. `moderation` must be
--    included: the RLS sub-selects and the view's WHERE clause read it.
grant select (id, category, title, description, lat, lng, address, photo_url,
              stage, moderation, assigned_to, resolution_summary,
              created_at, resolved_at, published_at)
  on public.issues to anon, authenticated;

-- 2. Side tables: read-only, rows gated by RLS.
grant select on public.issue_events  to anon, authenticated;
grant select on public.issue_sources to anon, authenticated;

-- 3. Policies (re-create so they are known-good).
alter table public.issues        enable row level security;
alter table public.issue_events  enable row level security;
alter table public.issue_sources enable row level security;

drop policy if exists issues_public_read on public.issues;
create policy issues_public_read on public.issues
  for select using (moderation = 'published');

drop policy if exists events_public_read on public.issue_events;
create policy events_public_read on public.issue_events
  for select using (
    exists (select 1 from public.issues i where i.id = issue_id and i.moderation = 'published')
  );

drop policy if exists sources_public_read on public.issue_sources;
create policy sources_public_read on public.issue_sources
  for select using (
    exists (select 1 from public.issues i where i.id = issue_id and i.moderation = 'published')
  );

-- 4. The view the front end reads — run as the CALLER so the grants above are
--    the single control (also clears the "security definer view" advisor item).
create or replace view public.issues_public
  with (security_invoker = on) as
  select id, category, title, description, lat, lng, address, photo_url,
         stage, assigned_to, resolution_summary, created_at, resolved_at, published_at
  from public.issues
  where moderation = 'published';
grant select on public.issues_public to anon, authenticated;

-- 5. Make sure the private columns are still NOT readable (must return 0 rows).
select column_name
  from information_schema.column_privileges
 where grantee in ('anon','authenticated') and table_name = 'issues'
   and column_name in ('reporter_contact','reporter_name');

-- 6. Verification (run as-is; all three should return rows, not errors):
--   set role anon;
--   select count(*) from public.issues_public;
--   select count(*) from public.issue_events;
--   select count(*) from public.issue_sources;
--   reset role;
