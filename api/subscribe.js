// POST /api/subscribe — capture an email for updates or meeting reminders.
import { admin, json, readBody } from './_lib.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const body = await readBody(req);
  const email = (body.email || '').trim().toLowerCase();
  const kind = body.kind === 'reminders' ? 'reminders' : 'updates';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json(res, 422, { error: 'Please enter a valid email address.' });

  // Idempotent: unique(email, kind) — ignore duplicates.
  const { error } = await admin.from('subscribers').upsert({ email, kind }, { onConflict: 'email,kind', ignoreDuplicates: true });
  if (error) return json(res, 500, { error: 'Could not subscribe right now.' });
  return json(res, 200, { ok: true });
}
