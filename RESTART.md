# RESTART — civicsentinel-tn
tier: public   (mirror of PROJECT.md)
updated: 2026-08-06

## Resume here
**The site IS deployed and has been since mid-July** — the previous RESTART said "not deployed",
which was wrong and cost a session's worth of rediscovery. Live at
https://www.civicsentinel-tn.com (also civicsentinel-tn.vercel.app). Vercel project
`civicsentinel-tn` / `prj_5ujRnD50CfTaCsIKNb5VKwipa30I` under `raccoonwhisperer's projects`.
Domain registered through Vercel, paid to 2027-06-17.

**But the backend is dead.** The Supabase project `mbdyzhaahhwozvsjsltr` no longer exists — its
hostname does not resolve on any public DNS resolver (a *paused* project would still resolve).
`/api/health` returns `{"ok":true,"db":false,"spam":false}`. The live site therefore shows an
empty log. Restoring it is the whole next step.

### Next action — blocked on Deryl, console work only
1. Create a NEW Supabase project; run the (now hardened) `supabase/schema.sql` in its SQL Editor.
2. `vercel env rm` + `add` for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. (`RATE_SALT` is fine.)
3. Create a Cloudflare Turnstile site for civicsentinel-tn.com. Put the **site** key in
   `config.js`, the **secret** in `vercel env add TURNSTILE_SECRET_KEY`.
4. Update `config.js` with the new project URL + anon/publishable key.
5. Set up mail for `contact@civicsentinel-tn.com` (now published in the footer and on all three
   policy pages — it must not bounce).
6. `vercel --prod`, then confirm `/api/health` reports `db:true, spam:true`.
7. Add the first operator: Supabase → Authentication → Users, then insert the UID into
   `public.admins`.

**Sequencing trap:** `verifyTurnstile` is now fail-CLOSED in production. If you deploy to prod
without `TURNSTILE_SECRET_KEY` set, every report submission is refused. Set the secret in the
same pass as the redeploy, or accept that reporting is down until you do.

## Active threads
- Public issue-reporting + lifecycle tracking site for Rutherford County, TN.
- **Source of truth is GitHub: `raccoonWhisperer/civicsentinel-tn`, branch `main` (PUBLIC repo).**
  This folder was, until 2026-08-06, a *divergent* snapshot with an unrelated history — taken
  a few hours before the last GitHub pushes and never reconciled. It was missing the keyword
  search, the category filter, the issue-log date range, the live ArcGIS boundary layers, and
  the `Authorization: Bearer` header that newer Supabase publishable keys require. Anyone
  deploying from the old folder state would have silently reverted all of it.
  The folder now tracks `origin`. Do not resurrect the old history.
- Old local history preserved on branch `backup/local-master-2026-08-06` (and `master`).
  Safe to delete once you are satisfied nothing was lost.
- Repo is also linked to Vercel (`.vercel/` present, gitignored).
- `_cleanup/` holds prod/update zips + an old build — gitignored, still on disk. Prune once
  the restore is verified.
- Only the **anon** key has ever been committed to the public repo (verified by decoding every
  JWT in the full history). No service-role key, no Turnstile secret. Nothing to rotate beyond
  the dead project's own keys.

## Changes made 2026-08-06 (uncommitted → see git log)
- **schema.sql privacy fix.** `public.issues` carries `reporter_contact` / `reporter_name`, and
  Supabase grants anon SELECT on new public tables by default. Combined with the existing
  `issues_public_read` policy, anyone with the public key could have read every reporter's email
  and phone via `/rest/v1/issues?select=reporter_contact`. The `issues_public` view was a
  convention, not a control. Now: blanket grants revoked, column-level SELECT re-granted on safe
  columns only, view switched to `security_invoker`. `moderation` is in the grant list on purpose —
  the view's WHERE clause reads it, and Postgres requires column privilege for WHERE-only columns.
- **Turnstile fail-closed** in `api/_lib.js` (was: silently returned `true` with no secret set,
  meaning production had zero bot protection and nothing said so).
- **Backend-down handling** in `app.js`. Previously a dead backend threw inside `API.list()` and
  every caller died silently, leaving the page asserting "0 issues logged" — which reads as
  "nothing was ever reported here" rather than "we cannot reach the record". Now caught once,
  honest banner, counters show "—". Also added a per-page-load cache (was fetching the full
  dataset four times).
- **Policy pages written**: `privacy.html`, `accessibility.html`, `terms.html`, `legal.css`.
  Footer links were dead `#` anchors. Contact changed from the bouncing placeholder
  `hello@civicsentinel.example` to `contact@civicsentinel-tn.com`.

## Known gaps — not yet addressed
- **Map sources wording** was overstated and is now corrected. District boundaries genuinely do
  load live from the county ArcGIS service. The USGS wells do not — they are a saved snapshot of
  real NWIS records, each linking back to its official station page. The old copy claimed both
  were live. On an accountability site, overstating your own sourcing is the one error you
  cannot afford, so keep an eye on this wording.
- Photos have no alt text; documented as a known limitation on the accessibility page.
- No independent accessibility audit.
- Seed issues CS-2025-001/002 in `schema.sql` are kept by Deryl's decision (2026-08-06).

## Guardrails
- PUBLIC tier. Keep firewall-clean: this is a civic-issue reporter — no campaign, litigation,
  or supporter-list content in this repo.
- Never put `SUPABASE_SERVICE_ROLE_KEY` or `TURNSTILE_SECRET_KEY` in `config.js` or any
  front-end file. They belong in Vercel env vars only.
