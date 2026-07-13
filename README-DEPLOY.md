# Civic Sentinel — Deploy Runbook (Vercel + Supabase)

Ship the site at **civicsentinel-tn.com** with a real database, resident submissions,
spam protection, moderation, and an operator console. Follow the phases in order.
Anywhere you see 🧑 it's your action; ⚙️ is already built in this repo.

Estimated hands-on time: **60–90 minutes.** Cost: **$0** to start (free tiers), plus the
domain (~$12–15/yr) if it isn't already registered.

---

## What you're standing up

```
Browser ──> Vercel (static site + /api serverless functions)
                        │
                        ├─ reads:  Supabase PostgREST (published records only, via anon key + RLS)
                        ├─ writes: /api/report  → Supabase (service role) + Cloudflare Turnstile
                        └─ admin:  /api/admin   → Supabase Auth (operator allow-list)
```

- **Vercel** — hosting + serverless functions (the `/api` folder).
- **Supabase** — Postgres database, Auth (operator logins), Storage (issue photos).
- **Cloudflare Turnstile** — invisible spam/bot check on the report form.
- **Domain** — `civicsentinel-tn.com` (DNS already points at Vercel — see Phase 5).

---

## Phase 0 — Accounts (🧑, ~10 min)
Create free accounts if you don't have them:
1. **GitHub** (to hold the code) — github.com
2. **Vercel** — vercel.com — sign in with GitHub
3. **Supabase** — supabase.com
4. **Cloudflare** — cloudflare.com (only needed for Turnstile)

---

## Phase 1 — Database (🧑 + ⚙️, ~15 min)
1. In Supabase, **New project**. Pick a name and a strong DB password; choose the US‑East region.
2. Open **SQL Editor → New query**. Paste the entire contents of **`supabase/schema.sql`** and click **Run.**
   This creates every table, the append‑only timeline guard, row‑level security, the public view,
   the photo storage bucket, and 3 seed records.
3. **Create operator logins:** Authentication → **Users → Add user** (email + password) for each
   person who will moderate. Then, back in **SQL Editor**, run this for each user (copy their UID
   from the Users list):
   ```sql
   insert into public.admins (user_id, email)
   values ('PASTE-USER-UID-HERE', 'operator@example.com');
   ```
4. **Grab your keys:** Project Settings → **API**. Copy:
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public** key
   - **service_role** key (secret — treat like a password)

---

## Phase 2 — Spam protection (🧑, ~5 min)
1. Cloudflare dashboard → **Turnstile → Add site**. Domain: `civicsentinel-tn.com`.
2. Copy the **Site Key** (public) and **Secret Key** (secret).
   *(If you skip Turnstile, the form still works — the server simply won't spam‑check. Add it before real launch.)*

---

## Phase 3 — Configure the code (🧑 + ⚙️, ~5 min)
1. Open **`config.js`** and fill the three **public** values:
   ```js
   window.CIVIC_CONFIG = {
     SUPABASE_URL: "https://xxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGci...",     // anon public key
     TURNSTILE_SITEKEY: "0x4AAAAA..."      // Turnstile SITE key
   };
   ```
   These are safe in the browser — row‑level security means the anon key can only read
   published records. Leaving them blank keeps the site in harmless demo mode.
2. Do **not** put the service‑role key or Turnstile secret here — those are server env vars (Phase 4).

---

## Phase 4 — Deploy to Vercel (🧑 + ⚙️, ~15 min)
1. Push this repo to GitHub:
   ```bash
   cd civic-sentinel-prod
   git init && git add -A && git commit -m "Civic Sentinel production"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/civic-sentinel.git
   git push -u origin main
   ```
2. In Vercel → **Add New → Project → Import** your GitHub repo.
   - **Framework Preset:** *Other*. No build command. Output/root is the repo root (this repo is
     already laid out the Vercel way: static files at root, functions in `/api`).
3. **Environment Variables** (Project → Settings → Environment Variables) — add the **secrets**:
   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | your Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | your Supabase **service_role** key |
   | `TURNSTILE_SECRET_KEY` | your Turnstile **secret** key |
4. Click **Deploy.** You'll get a `*.vercel.app` URL — open it and confirm the site loads with live data.

---

## Phase 5 — Domain (🧑, ~10 min + DNS wait)
`civicsentinel-tn.com` already resolves to Vercel's IPs, so DNS is (almost certainly) set up already.
1. Vercel → Project → **Settings → Domains → Add** `civicsentinel-tn.com` (and `www.civicsentinel-tn.com`).
2. Vercel will show either "Valid Configuration" (done) or the exact **A / CNAME** records to set at
   your registrar. If it asks for records, add them where you bought the domain:
   - `A`  @  →  `216.198.79.65`  (or the IP Vercel shows)
   - `CNAME`  www  →  `cname.vercel-dns.com`
3. Wait for SSL to issue (usually minutes). If the domain **isn't** actually registered yet, buy it
   first (Cloudflare Registrar / Namecheap / Porkbun) then repeat this phase.

---

## Phase 6 — Verify (🧑, ~10 min)
Run this checklist on the live domain:
- [ ] Homepage loads; counters/map/carousel show your Supabase data (not the demo seed).
- [ ] **Submit a test report** → you get a tracking ID and a "submitted for review" message.
- [ ] Go to **`/admin.html`**, sign in as an operator → the test report is in the **Moderation queue.**
- [ ] **Approve** it → it appears on the public record and on the map; counter goes up.
- [ ] **Advance** it (e.g. to *Under review*, then *Resolved* with a summary) → the public
      timeline shows each step with date + note + who acted.
- [ ] **Reject** a spam test → it does **not** appear publicly.
- [ ] Subscribe with an email → row appears in Supabase `subscribers`.
- [ ] Language toggle (EN/ES) works across the site.

---

## Operating it
- **The console** lives at `civicsentinel-tn.com/admin.html` (noindexed). Only allow‑listed
  operators can sign in. Add/remove operators via Supabase Users + the `admins` table.
- **The timeline is append‑only by design** — a database trigger blocks edits/deletes on
  `issue_events`, so the public trail can never be quietly rewritten. To correct a mistake,
  add a new event that supersedes it.
- **Reporter contact info is private** — the public API reads a view that omits it; only operators
  see it in the console.

## Framing & compliance (important)
This is an **independent, resident‑run** public record. It is not a government system and does not
imply official endorsement. Status entries reflect what operators can verify; official actions are
cited to public documents. Keep the footer disclaimer, and if you later collect donations or do
express advocacy, add the relevant Tennessee/FEC disclaimers.

## Where to extend next
- **Email notifications** (status‑change alerts, reminders): add [Resend](https://resend.com) and a
  small function that emails the reporter/subscribers on `advance`.
- **Tombstone data model:** when its exact fields arrive, extend the `issues` / `issue_events`
  columns and the `/api/report` + `/api/admin` payloads to match.
