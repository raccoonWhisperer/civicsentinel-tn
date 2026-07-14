// GET /api/health — lightweight, PUBLIC status probe for uptime monitors
// (UptimeRobot, Better Uptime, etc.). Returns no sensitive data — just
// whether the app can reach its database and whether spam protection is on.
import { admin, json } from './_lib.js';

export default async function handler(req, res) {
  const spam = !!process.env.TURNSTILE_SECRET_KEY;
  let db = false;
  try {
    // cheap round-trip to confirm the DB is reachable
    const { error } = await admin.from('issues').select('id', { count: 'exact', head: true });
    db = !error;
  } catch { db = false; }
  json(res, 200, { ok: true, db, spam, time: new Date().toISOString() });
}
