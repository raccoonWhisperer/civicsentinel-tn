// =====================================================================
// Civic Sentinel — Operator Console logic.
// Auth via Supabase (GoTrue REST). Actions via /api/admin (Bearer token).
// =====================================================================
'use strict';
const CFG = window.CIVIC_CONFIG || {};
const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const STAGES = ['Acknowledged','Under review','Action assigned','In progress','Resolved','Closed / no action'];
const $ = (s)=>document.querySelector(s);
let TOKEN = null;

function notice(msg, kind){ const n=$('#notice'); n.innerHTML = msg ? `<div class="notice ${kind||'ok'}">${msg}</div>` : ''; if(msg) setTimeout(()=>{ if(n.firstChild) n.innerHTML=''; }, 6000); }
function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function stageClass(st){ if(st==='Resolved')return'st-done'; if(st==='Closed / no action')return'st-closed'; if(st==='Submitted'||st==='Acknowledged')return'st-open'; return'st-prog'; }

if(!CONFIGURED){
  notice('This console is in <strong>demo mode</strong> — no Supabase backend is configured yet. Fill in <span class="mono">config.js</span> (and set the server env vars in Vercel) to enable sign-in and live moderation.', 'err');
  $('#notice').firstChild && ($('#notice').firstChild.className = 'notice demo-warn');
}

async function login(){
  const email = $('#email').value.trim(), password = $('#pw').value;
  if(!email || !password) return notice('Enter your email and password.', 'err');
  if(!CONFIGURED) return notice('Backend not configured (config.js is blank).', 'err');
  try{
    const r = await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method:'POST', headers:{ 'Content-Type':'application/json', apikey: CFG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    });
    const j = await r.json();
    if(!r.ok || !j.access_token) return notice(j.error_description || j.msg || 'Sign-in failed.', 'err');
    TOKEN = j.access_token;
    $('#loginCard').classList.add('hidden');
    $('#console').classList.remove('hidden');
    $('#logout').classList.remove('hidden');
    notice('', '');
    loadQueue();
  }catch(e){ notice('Sign-in error: '+e.message, 'err'); }
}

async function api(action, payload){
  const r = await fetch('/api/admin', {
    method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${TOKEN}` },
    body: JSON.stringify({ action, ...(payload||{}) })
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error || ('request failed '+r.status));
  return j;
}

async function loadQueue(){
  try{
    const { issues, events } = await api('queue');
    const pending = issues.filter(i=>i.moderation==='pending');
    const published = issues.filter(i=>i.moderation==='published');
    $('#pendCount').textContent = `(${pending.length})`;
    $('#pubCount').textContent = `(${published.length})`;
    renderPending(pending, events);
    renderPublished(published, events);
  }catch(e){ notice('Could not load queue: '+e.message, 'err'); }
}

function eventsFor(id, events){ return events.filter(e=>e.issue_id===id).sort((a,b)=>String(a.ts).localeCompare(String(b.ts))); }

function renderPending(list, events){
  const el = $('#pending');
  if(!list.length){ el.innerHTML = '<p class="count">Nothing waiting — the queue is clear.</p>'; return; }
  el.innerHTML = list.map(i=>`
    <div class="issue" data-id="${i.id}">
      <div class="row" style="justify-content:space-between">
        <span class="mono">${i.id}</span><span class="badge pend">Pending review</span>
      </div>
      <h3>${esc(i.title)}</h3>
      <div class="meta">${esc(i.category)} · ${esc(i.address||'no location')} · ${String(i.created_at).slice(0,10)}</div>
      <p>${esc(i.description)}</p>
      ${i.photo_url?`<p><a href="${esc(i.photo_url)}" target="_blank" rel="noopener">View attached photo ↗</a></p>`:''}
      <p class="mono">Reporter contact (private): ${esc(i.reporter_contact||'—')}${i.reporter_name?(' · '+esc(i.reporter_name)):''}</p>
      <div class="row">
        <button class="btn btn--primary btn--sm" data-approve="${i.id}">Approve &amp; publish</button>
        <button class="btn btn--danger btn--sm" data-reject="${i.id}">Reject</button>
      </div>
    </div>`).join('');
}

function renderPublished(list, events){
  const el = $('#published');
  if(!list.length){ el.innerHTML = '<p class="count">No published issues yet.</p>'; return; }
  el.innerHTML = list.map(i=>{
    const tl = eventsFor(i.id, events).map(e=>`<li><strong>${esc(e.stage)}</strong> · ${String(e.ts).slice(0,10)} — ${esc(e.note||'')} <em>(${esc(e.actor||'')})</em></li>`).join('');
    const opts = STAGES.map(s=>`<option value="${s}" ${s===i.stage?'selected':''}>${s}</option>`).join('');
    return `
    <div class="issue" data-id="${i.id}">
      <div class="row" style="justify-content:space-between">
        <span class="mono">${i.id}</span><span class="badge ${stageClass(i.stage)}">${esc(i.stage)}</span>
      </div>
      <h3>${esc(i.title)}</h3>
      <div class="meta">${esc(i.category)} · ${esc(i.address||'no location')} · assigned: ${esc(i.assigned_to||'—')}</div>
      <details><summary class="count">Timeline (${eventsFor(i.id,events).length})</summary><ul class="tl">${tl}</ul></details>
      <div class="grid2" style="margin-top:10px">
        <div><label>Advance to stage</label><select data-stage="${i.id}">${opts}</select></div>
        <div><label>Who acted (attribution)</label><input data-actor="${i.id}" placeholder="e.g. Civic Sentinel, or 'County Highway Dept'"></div>
      </div>
      <div class="grid2" style="margin-top:10px">
        <div><label>Assigned to (optional)</label><input data-assigned="${i.id}" value="${esc(i.assigned_to||'')}"></div>
        <div></div>
      </div>
      <div style="margin-top:10px"><label>Note (what changed)</label><textarea data-note="${i.id}" placeholder="Describe exactly what happened."></textarea></div>
      <p class="count" style="color:#a86a10;margin:6px 0 0">Integrity rule: only attribute a step to a government office if it actually happened and you can cite a public document. Otherwise attribute it to Civic Sentinel. Every entry is permanent and public.</p>
      <div data-reswrap="${i.id}" class="hidden" style="margin-top:10px"><label>Resolution summary (shown publicly when Resolved)</label><textarea data-res="${i.id}"></textarea></div>
      <div class="row" style="margin-top:10px"><button class="btn btn--primary btn--sm" data-advance="${i.id}">Save update</button></div>
    </div>`;
  }).join('');
}

// Event delegation
document.addEventListener('click', async (e)=>{
  const t = e.target;
  if(t.id==='login') return login();
  if(t.id==='logout'){ TOKEN=null; location.reload(); return; }
  if(t.id==='refresh') return loadQueue();

  const ap = t.getAttribute?.('data-approve');
  const rj = t.getAttribute?.('data-reject');
  const ad = t.getAttribute?.('data-advance');
  try{
    if(ap){ t.disabled=true; await api('approve',{id:ap}); notice('Published to the public record.','ok'); return loadQueue(); }
    if(rj){ if(!confirm('Reject and hide this submission?')) return; await api('reject',{id:rj}); notice('Submission rejected.','ok'); return loadQueue(); }
    if(ad){
      const stage = document.querySelector(`[data-stage="${ad}"]`).value;
      const note = document.querySelector(`[data-note="${ad}"]`).value.trim();
      const assigned = document.querySelector(`[data-assigned="${ad}"]`).value.trim();
      const actor = document.querySelector(`[data-actor="${ad}"]`)?.value.trim() || '';
      const res = document.querySelector(`[data-res="${ad}"]`)?.value.trim() || '';
      t.disabled=true;
      await api('advance',{ id:ad, stage, note, actor, assigned_to:assigned, resolution_summary: stage==='Resolved'?res:undefined });
      notice('Update saved and appended to the timeline.','ok'); return loadQueue();
    }
  }catch(err){ notice('Action failed: '+err.message,'err'); if(t) t.disabled=false; }
});

// Reveal resolution field when "Resolved" is chosen
document.addEventListener('change', (e)=>{
  const id = e.target.getAttribute?.('data-stage');
  if(id){ const wrap=document.querySelector(`[data-reswrap="${id}"]`); if(wrap) wrap.classList.toggle('hidden', e.target.value!=='Resolved'); }
});

// Enter to sign in (only while the login card is visible)
document.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !$('#loginCard').classList.contains('hidden')) login(); });
