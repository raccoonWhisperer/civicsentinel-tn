#!/bin/bash
cd /Users/derylduer/Workspace/civicsentinel-tn || exit 1
rm -f .git/index.lock .git/objects/maintenance.lock
git add .gitignore app.js supabase/schema.sql supabase/fix-2026-09-14-anon-grants.sql scripts/hotfix-checkout-2026-09-14.sh scripts/hotfix-commit-2026-09-14.sh
git commit -q -F - <<'MSG'
Restore public record: tolerate side-table failures, honest empty state, anon grant fix SQL

Live site showed "0 issues logged" with an empty log. Root cause is in the
database, not the site: the anon role lost SELECT on public.issues, so the
RLS sub-selects on issue_events/issue_sources fail (42501) while
issues_public (owner-run view) still returns all 33 rows. One rejection in
Promise.all then sank the whole page.

- app.js: load issues/events/sources with Promise.allSettled; issues are
  required, side tables optional; banner announces PARTIAL vs UNAVAILABLE;
  counters show "—" instead of a fabricated 0 when the record is unreachable;
  sb() errors now carry PostgREST's message and code; one cached fetch/page.
- supabase/fix-2026-09-14-anon-grants.sql: idempotent grants/policies/view
  fix to run in the SQL editor (column-level grant keeps reporter_contact and
  reporter_name private; issues_public rebuilt as security_invoker).
- supabase/schema.sql: hardened version from restore/backend-and-policy.
- .gitignore: keep .env.local, .vercel, _cleanup out of the public repo.

Not included on purpose: the fail-closed Turnstile change from
restore/backend-and-policy — TURNSTILE_SECRET_KEY is not set in Vercel, so
shipping it would block every report submission.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01R2qozBwfQ87YJifCg59vpn
MSG
git log --oneline -2
git status --short | head -8
git diff --stat HEAD~1 HEAD | tail -1
MSG_END=1
