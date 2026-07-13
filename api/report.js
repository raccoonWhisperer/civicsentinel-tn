// POST /api/report — create a resident-submitted issue (enters as "pending").
// Public endpoint. Protected by Cloudflare Turnstile. Writes with service role.
import { admin, json, readBody, verifyTurnstile, nextId, clientIp } from './_lib.js';

const CATEGORIES = [
  'Infrastructure & roads',
  'Water, drainage & karst/sinkhole hazards',
  'Environmental & drilling concerns',
  'Public safety',
  'Zoning & development',
  'Other'
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await readBody(req);

  // Spam / bot check
  const ok = await verifyTurnstile(body.turnstileToken, clientIp(req));
  if (!ok) return json(res, 400, { error: 'Verification failed. Please try again.' });

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

  return json(res, 200, { id });
}

function numOrNull(v) { const n = parseFloat(v); return isNaN(n) ? null : n; }
