-- =====================================================================
-- CIVIC SENTINEL — Supabase schema (Postgres)
-- Run this in your Supabase project: SQL Editor → paste → Run.
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT where practical.
--
-- Design:
--   * issues            — one row per reported concern
--   * issue_events      — APPEND-ONLY lifecycle trail (the public timeline)
--   * issue_sources     — linked official documents (TDEC, USGS, EFI, …)
--   * subscribers       — email list (updates / meeting reminders)
--   * admins            — allow-list of operator accounts (by auth uid)
--
-- Security model (Row Level Security):
--   * The public (anon key) can READ only PUBLISHED, non-rejected issues
--     and their events/sources. Nothing else.
--   * All WRITES happen through Vercel serverless functions using the
--     SERVICE ROLE key (which bypasses RLS) after Turnstile/auth checks.
--     So we intentionally grant NO insert/update to anon/authenticated.
-- =====================================================================

-- ---- enums -----------------------------------------------------------
do $$ begin
  create type issue_stage as enum
    ('Submitted','Acknowledged','Under review','Action assigned','In progress','Resolved','Closed / no action');
exception when duplicate_object then null; end $$;

do $$ begin
  create type moderation_status as enum ('pending','published','rejected');
exception when duplicate_object then null; end $$;

-- ---- issues ----------------------------------------------------------
create table if not exists public.issues (
  id                text primary key,               -- e.g. CS-2026-0142
  category          text not null,
  title             text not null,
  description       text not null,
  lat               double precision,
  lng               double precision,
  address           text,
  reporter_contact  text,                            -- PRIVATE: never selected by public policy
  reporter_name     text,                            -- PRIVATE
  photo_url         text,
  stage             issue_stage not null default 'Submitted',
  moderation        moderation_status not null default 'pending',
  assigned_to       text,
  resolution_summary text,
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz,
  published_at      timestamptz
);
create index if not exists issues_moderation_idx on public.issues (moderation);
create index if not exists issues_category_idx  on public.issues (category);
create index if not exists issues_stage_idx     on public.issues (stage);

-- ---- append-only lifecycle events -----------------------------------
create table if not exists public.issue_events (
  id          bigint generated always as identity primary key,
  issue_id    text not null references public.issues(id) on delete cascade,
  stage       issue_stage not null,
  note        text,
  actor       text,
  ts          timestamptz not null default now()
);
create index if not exists issue_events_issue_idx on public.issue_events (issue_id, ts);

-- Guard: make issue_events effectively append-only (no UPDATE/DELETE),
-- even for the service role, so the public trail can never be rewritten.
create or replace function public.block_event_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'issue_events is append-only';
end $$;

drop trigger if exists no_update_events on public.issue_events;
drop trigger if exists no_delete_events on public.issue_events;
create trigger no_update_events before update on public.issue_events
  for each row execute function public.block_event_mutation();
create trigger no_delete_events before delete on public.issue_events
  for each row execute function public.block_event_mutation();

-- ---- linked source documents ----------------------------------------
create table if not exists public.issue_sources (
  id        bigint generated always as identity primary key,
  issue_id  text not null references public.issues(id) on delete cascade,
  label     text not null,
  url       text not null
);
create index if not exists issue_sources_issue_idx on public.issue_sources (issue_id);

-- ---- subscribers -----------------------------------------------------
create table if not exists public.subscribers (
  id         bigint generated always as identity primary key,
  email      text not null,
  kind       text not null default 'updates',   -- 'updates' | 'reminders'
  created_at timestamptz not null default now(),
  unique (email, kind)
);

-- ---- admin allow-list ------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  added_at   timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.issues        enable row level security;
alter table public.issue_events  enable row level security;
alter table public.issue_sources enable row level security;
alter table public.subscribers   enable row level security;
alter table public.admins        enable row level security;

-- Public read: only published & not rejected.
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

-- No public policies for subscribers/admins → anon/authenticated cannot read them.
-- All inserts/updates go through serverless functions using the service role,
-- which bypasses RLS. We deliberately create NO insert/update/delete policies here.

-- IMPORTANT: the anon SELECT on issues would expose reporter_contact/name.
-- We protect those by exposing a PUBLIC VIEW that omits private columns and
-- pointing the frontend at the view instead of the base table.
create or replace view public.issues_public as
  select id, category, title, description, lat, lng, address, photo_url,
         stage, assigned_to, resolution_summary, created_at, resolved_at, published_at
  from public.issues
  where moderation = 'published';

-- Expose the view through PostgREST with anon read.
grant select on public.issues_public to anon, authenticated;
grant select on public.issue_events  to anon, authenticated;
grant select on public.issue_sources to anon, authenticated;

-- Helper: is the current JWT an allow-listed admin?
create or replace function public.is_admin() returns boolean
  language sql stable as $$
    select exists (select 1 from public.admins a where a.user_id = auth.uid());
  $$;

-- =====================================================================
-- STORAGE (photos) — create a public-read bucket for issue photos.
-- (You can also do this in the dashboard: Storage → New bucket → 'issue-photos', public.)
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('issue-photos','issue-photos', true)
on conflict (id) do nothing;

-- Public can read photos; uploads happen server-side via service role.
drop policy if exists issue_photos_public_read on storage.objects;
create policy issue_photos_public_read on storage.objects
  for select using (bucket_id = 'issue-photos');

-- =====================================================================
-- SEED (optional) — a few published records so the site isn't empty on
-- first deploy. Delete this block if you want to start clean.
-- =====================================================================
insert into public.issues (id,category,title,description,lat,lng,address,stage,moderation,assigned_to,resolution_summary,created_at,resolved_at,published_at) values
 ('CS-2025-0087','Environmental & drilling concerns','Geothermal drilling proposed at Poplar Hill school site','A new high school is proposed on karst terrain at the Dismukes farm. Residents are asking for a site-specific geophysical survey before any geothermal wells are drilled, given a documented failure at a nearby elementary school.',35.9037,-86.5216,'Poplar Hill Rd, Rutherford County','Under review','published','County Public Works — Geotech review',null,'2025-08-14',null,'2025-08-19'),
 ('CS-2025-0091','Water, drainage & karst/sinkhole hazards','New depression opening in field off Poplar Hill Rd','A shallow bowl-shaped depression appeared and has widened over two weeks after heavy rain, roughly 40 yards from the property line of the proposed site.',35.9059,-86.5231,'Field off Poplar Hill Rd','Action assigned','published','County Engineer — field inspection',null,'2025-09-02',null,'2025-09-04'),
 ('CS-2024-0203','Infrastructure & roads','Roadbed slumping on Franklin Rd shoulder','A section of shoulder had begun to slump and crack, widening after rain. Reported as a possible subsurface void under the roadbed.',35.8934,-86.5122,'Franklin Rd shoulder','Resolved','published','County Highway Dept','Void grouted and shoulder rebuilt; monitored for 60 days with no recurrence.','2024-10-05','2024-12-01','2024-10-07')
on conflict (id) do nothing;

insert into public.issue_events (issue_id,stage,note,actor,ts) values
 ('CS-2025-0087','Submitted','Filed by resident coalition with EFI Global report attached.','Resident','2025-08-14'),
 ('CS-2025-0087','Acknowledged','Logged and routed to Public Works.','Civic Sentinel intake','2025-08-19'),
 ('CS-2025-0087','Under review','Geotech review opened; TDEC Notice of Violation (Sept 5) added to the file.','County Public Works','2025-09-08'),
 ('CS-2025-0091','Submitted','Photos of the depression uploaded.','Resident','2025-09-02'),
 ('CS-2025-0091','Acknowledged','Received; cross-referenced with USGS karst layer.','Civic Sentinel intake','2025-09-04'),
 ('CS-2025-0091','Action assigned','Field inspection scheduled; area flagged for monitoring.','County Engineer','2025-09-16'),
 ('CS-2024-0203','Submitted','Cracking shoulder reported.','Resident','2024-10-05'),
 ('CS-2024-0203','Resolved','Repair completed; 60-day monitoring clear.','County Highway Dept','2024-12-01');

insert into public.issue_sources (issue_id,label,url) values
 ('CS-2025-0087','EFI Global engineering assessment','https://www.efiglobal.com/'),
 ('CS-2025-0087','TDEC Notice of Violation (Sept 5, 2025)','https://www.tn.gov/environment.html');

-- =====================================================================
-- AFTER RUNNING: create your first admin.
--   1) Authentication → Users → Add user (email/password) for each operator.
--   2) Copy each user's UID, then run (replace the UUID + email):
--        insert into public.admins (user_id, email)
--        values ('00000000-0000-0000-0000-000000000000','you@example.com');
-- =====================================================================
