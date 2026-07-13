// =====================================================================
// Shared helpers for Civic Sentinel serverless functions.
// Files prefixed with "_" are NOT routed by Vercel — helpers only.
// =====================================================================
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client bypasses RLS. NEVER expose this key to the browser.
export const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

export function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
  });
}

// Cloudflare Turnstile verification. If no secret is configured, we skip
// (useful for local/dev), but on production you should always set it.
export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // dev fallback
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip || '' })
    });
    const j = await r.json();
    return !!j.success;
  } catch {
    return false;
  }
}

// Verify the caller is an allow-listed admin. Expects "Authorization: Bearer <jwt>".
export async function requireAdmin(req) {
  const authz = req.headers['authorization'] || '';
  const jwt = authz.startsWith('Bearer ') ? authz.slice(7) : null;
  if (!jwt) return { ok: false, code: 401, msg: 'Missing token' };
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return { ok: false, code: 401, msg: 'Invalid session' };
  const { data: row } = await admin.from('admins').select('user_id').eq('user_id', data.user.id).maybeSingle();
  if (!row) return { ok: false, code: 403, msg: 'Not an operator' };
  return { ok: true, user: data.user };
}

// Next tracking id: CS-<year>-#### (4-digit, sequential within the year).
export async function nextId() {
  const year = new Date().getUTCFullYear();
  const prefix = `CS-${year}-`;
  const { data } = await admin
    .from('issues')
    .select('id')
    .like('id', `${prefix}%`)
    .order('id', { ascending: false })
    .limit(1);
  let n = 1;
  if (data && data[0]) {
    const last = parseInt(String(data[0].id).slice(prefix.length), 10);
    if (!isNaN(last)) n = last + 1;
  }
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}
