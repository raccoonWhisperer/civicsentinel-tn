// POST /api/report — create a resident-submitted issue (enters as "pending").
// Public endpoint. Three layers of abuse defense:
//   1. Cloudflare Turnstile ("I'm human") — verified server-side.
//   2. Honeypot field — a hidden input bots fill and humans never see.
//   3. Per-IP rate limiting — caps reports from one source per time window.
import crypto from 'crypto';
import { admin, json, readBody, verifyTurnstile, nextId, clientIp } from './_lib.js';

const RATE_WINDOW_MIN = 10;   // look-back window
const RATE_MAX = 5;           // max reports per IP per window

const CATEGORIES = [
  'Infrastructure & roads',
  'Water, drainage & karst/sinkhole hazards',
  'Environmental & drilling concerns',
  'Data centers',
  'Public safety',
  'Zoning & development',
  'Other'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await readBody(req);
  const ip = clientIp(req);

  // Layer 2 — honeypot. A real person never fills the hidden field. If it has
  // a value, silently accept-and-drop so the bot thinks it succeeded.
  if ((body.hp || '').trim()) return json(res, 200, { id: 'received' });

  // Layer 1 — Turnstile "I'm human" verification.
  const ok = await verifyTurnstile(body.turnstileToken, ip);
  if (!ok) return json(res, 400, { error: 'Verification failed. Please try again.' });

  // Layer 3 — per-IP rate limit (salted-hash, no raw IP stored).
  const ipHash = crypto.createHash('sha256').update((process.env.RATE_SALT || 'civic-sentinel') + ip).digest('hex');
  try {
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60000).toISOString();
    const { count } = await admin.from('submission_rate')
      .select('*', { count: 'exact', head: true }).eq('ip_hash', ipHash).gte('ts', since);
    if ((count || 0) >= RATE_MAX)
      return json(res, 429, { error: 'You have submitted several reports recently. Please wait a few minutes and try again.' });
  } catch { /* if the rate table is unavailable, fail open rather than block real reports */ }

  // Validate
  const title = (body.title || '').trim();
  const description = (body.description || '').trim();
  const category = (body.category || '').trim();
  if (!title || !description || !CATEGORIES.includes(category))
    return json(res, 422, { error: 'Please provide a category, a summary, and a description.' });
  if (title.length > 140 || description.length > 4000)
    return json(res, 422, { error: 'Submission too long.' });

  const id = await nextId();
  const now = new Date().toISOString();

  // Optional photo (data URL). Upload to storage; store public URL.
  let photo_url = null;
  if (body.photoDataUrl && typeof body.photoDataUrl === 'string' && body.photoDataUrl.startsWith('data:image/')) {
    try {
      const m = body.photoDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (m) {
        const ext = m[1].split('/')[1].replace('jpeg', 'jpg');
        const buf = Buffer.from(m[2], 'base64');
        if (buf.length <= 6 * 1024 * 1024) { // 6 MB cap
          const path = `${id}.${ext}`;
          const up = await admin.storage.from('issue-photos').upload(path, buf, { contentType: m[1], upsert: true });
          if (!up.error) {
            const { data: pub } = admin.storage.from('issue-photos').getPublicUrl(path);
            photo_url = pub?.publicUrl || null;
          }
        }
      }
    } catch { /* non-fatal: proceed without photo */ }
  }

  const { error: e1 } = await admin.from('issues').insert({
    id, category, title, description,
    lat: numOrNull(body.lat), lng: numOrNull(body.lng),
    address: (body.address || '').trim() || null,
    reporter_contact: (body.contact || '').trim() || null,
    reporter_name: (body.name || '').trim() || null,
    photo_url,
    stage: 'Submitted',
    moderation: 'pending',
    created_at: now
  });
  if (e1) return json(res, 500, { error: 'Could not save your report.' });

  await admin.from('issue_events').insert({
    issue_id: id, stage: 'Submitted',
    note: 'Report submitted by resident. Pending moderator review before it appears publicly.',
    actor: 'Resident', ts: now
  });

  // Record this accepted submission for rate limiting (fire-and-forget).
  admin.from('submission_rate').insert({ ip_hash: ipHash }).then(()=>{}, ()=>{});

  return json(res, 200, { id });
}

function numOrNull(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
