// =====================================================================
// Civic Sentinel — PUBLIC front-end config.
// These three values are safe to expose in the browser:
//   * SUPABASE_URL      — your project URL
//   * SUPABASE_ANON_KEY — the ANON (public) key. Row-Level Security means it
//                         can only read published records — never private data.
//   * TURNSTILE_SITEKEY — Cloudflare Turnstile *site* key (public by design)
//
// Leave them BLANK to run in demo mode (in-memory seed data, no backend).
// Fill them in to go live. (Server-only secrets — service role key, Turnstile
// SECRET key — never go here; they live in Vercel Environment Variables.)
// =====================================================================
window.CIVIC_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",
  TURNSTILE_SITEKEY: ""
};
