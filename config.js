// Civic Sentinel — PUBLIC front-end config.
// SUPABASE_URL + SUPABASE_ANON_KEY are safe in the browser (Row-Level Security
// keeps the anon key read-only to published data). Server-only secrets live in
// Vercel Environment Variables, never here.
window.CIVIC_CONFIG = {
  SUPABASE_URL: "https://mbdyzhaahhwozvsjsltr.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1iZHl6aGFhaGh3b3p2c2pzbHRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5ODE5MTMsImV4cCI6MjA5OTU1NzkxM30.5du9AGVpfpTS5hpx3NI45Uh6thLbmv1yRVSJvUL0qI0",
  TURNSTILE_SITEKEY: ""
};
