// POST /api/admin — operator-only actions. Requires a valid Supabase session
// belonging to an allow-listed admin (see public.admins). Writes with service role.
//
// Body: { action, ...payload }
//   action = 'queue'    -> list pending + published issues for the console
//   action = 'approve'  -> { id }            publish a pending submission
//   action = 'reject'   -> { id, note? }     hide a submission
//   action = 'advance'  -> { id, stage, note, actor?, assigned_to?, resolution_summary? }
//                          append a lifecycle event + move the issue's stage.
import { admin, json, readBody, requireAdmin } from './_lib.js';

const STAGES = ['Submitted','Acknowledged','Under review','Action assigned','In progress','Resolved','Closed / no action'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  const gate = await requireAdmin(req);
  if (!gate.ok) return json(res, gate.code, { error: gate.msg });
  const who = gate.user.email || 'Operator';
  const body = await readBody(req);
  const now = new Date().toISOString();

  try {
    switch (body.action) {
      case 'queue': {
        const { data: issues } = await admin.from('issues')
          .select('*').order('created_at', { ascending: false });
        const { data: events } = await admin.from('issue_events')
          .select('*').order('ts', { ascending: true });
        return json(res, 200, { issues: issues || [], events: events || [] });
      }

      case 'stats': {
        // Aggregates for the maintenance dashboard.
        const { data: issues } = await admin.from('issues')
          .select('id,category,stage,moderation,created_at,resolved_at,published_at');
        const { count: subsUpdates } = await admin.from('subscribers')
          .select('*', { count: 'exact', head: true }).eq('kind', 'updates');
        const { count: subsRemind } = await admin.from('subscribers')
          .select('*', { count: 'exact', head: true }).eq('kind', 'reminders');
        const { data: recent } = await admin.from('issue_events')
          .select('*').order('ts', { ascending: false }).limit(15);
        let db = true;
        return json(res, 200, {
          issues: issues || [],
          subscribers: { updates: subsUpdates || 0, reminders: subsRemind || 0 },
          recent: recent || [],
          health: { db, spam: !!process.env.TURNSTILE_SECRET_KEY, time: now }
        });
      }

      case 'approve': {
        if (!body.id) return json(res, 422, { error: 'Missing id' });
        const { error } = await admin.from('issues')
          .update({ moderation: 'published', published_at: now }).eq('id', body.id);
        if (error) throw error;
        await admin.from('issue_events').insert({
          issue_id: body.id, stage: 'Acknowledged',
          note: 'Received and published to the public record by Civic Sentinel.', actor: 'Civic Sentinel (' + who + ')', ts: now
        });
        // If still at Submitted, move to Acknowledged on publish.
        await admin.from('issues').update({ stage: 'Acknowledged' })
          .eq('id', body.id).eq('stage', 'Submitted');
        return json(res, 200, { ok: true });
      }

      case 'reject': {
        if (!body.id) return json(res, 422, { error: 'Missing id' });
        const { error } = await admin.from('issues')
          .update({ moderation: 'rejected' }).eq('id', body.id);
        if (error) throw error;
        return json(res, 200, { ok: true });
      }

      case 'advance': {
        const { id, stage, note } = body;
        if (!id || !STAGES.includes(stage)) return json(res, 422, { error: 'Missing id or invalid stage' });
        const patch = { stage };
        if (body.assigned_to !== undefined) patch.assigned_to = body.assigned_to || null;
        if (stage === 'Resolved') {
          patch.resolved_at = now;
          if (body.resolution_summary) patch.resolution_summary = body.resolution_summary;
        }
        const { error } = await admin.from('issues').update(patch).eq('id', id);
        if (error) throw error;
        await admin.from('issue_events').insert({
          issue_id: id, stage,
          note: (note || '').trim() || `Advanced to ${stage}.`,
          actor: (body.actor || '').trim() || ('Civic Sentinel (' + who + ')'), ts: now
        });
        return json(res, 200, { ok: true });
      }

      default:
        return json(res, 400, { error: 'Unknown action' });
    }
  } catch (e) {
    return json(res, 500, { error: 'Action failed: ' + (e.message || 'unknown') });
  }
}
