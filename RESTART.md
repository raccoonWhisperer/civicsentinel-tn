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
- Repo is now linked to Vercel (`.vercel/` present, gitignored). Still **no git remote** —
  every deploy so far has been a CLI push from this folder, so the deployed build has never
  been reproducible from a commit. Creating the GitHub repo is worth doing.
- `_cleanup/` holds prod/update zips + an old build — prune once the restore is verified.

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
- **Deployed copy overstates the map.** The live build says commissioner districts, school-board
  zones and USGS wells "load live from the official sources". They do not: `SINKS`, `WELLS` and
  `BOUNDS` are hardcoded arrays in `app.js`. Local `index.html` is honest about this ("full
  official layers are imported before launch"), so redeploying from this folder fixes the claim.
  Verify that wording survives the next deploy — on an accountability site, overstating your
  sources is the one error you cannot afford.
- Photos have no alt text; documented as a known limitation on the accessibility page.
- No independent accessibility audit.
- Seed issues CS-2025-001/002 in `schema.sql` are kept by Deryl's decision (2026-08-06).

## Guardrails
- PUBLIC tier. Keep firewall-clean: this is a civic-issue reporter — no campaign, litigation,
  or supporter-list content in this repo.
- Never put `SUPABASE_SERVICE_ROLE_KEY` or `TURNSTILE_SECRET_KEY` in `config.js` or any
  front-end file. They belong in Vercel env vars only.
