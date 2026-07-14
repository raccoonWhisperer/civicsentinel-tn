// =====================================================================
// Civic Sentinel — Maintenance Dashboard.
// Stats + site status for operators. Auth via Supabase; data via
// /api/admin action 'stats'. Falls back to a labeled demo preview when
// no backend is configured so the layout is visible pre-launch.
// =====================================================================
'use strict';
const CFG = window.CIVIC_CONFIG || {};
const CONFIGURED = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const $ = (s)=>document.querySelector(s);
let TOKEN = null;

function esc(s){ return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function notice(msg, kind){ $('#notice').innerHTML = msg ? `<div class="notice ${kind||''}">${msg}</div>` : ''; }
function stageClass(st){ if(st==='Resolved')return'st-done'; if(st==='Closed / no action')return'st-closed'; if(st==='Submitted'||st==='Acknowledged')return'st-open'; return'st-prog'; }
function fmt(ts){ if(!ts) return '—'; const d=new Date(ts); return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}); }
function daysBetween(a,b){ return Math.round((new Date(b)-new Date(a))/86400000); }

// Demo preview data (clearly labeled; only used with no backend).
const DEMO = {
  issues:[
    {id:'CS-2025-001',category:'Environmental & drilling concerns',stage:'Acknowledged',moderation:'published',created_at:'2025-08-14',resolved_at:null},
    {id:'CS-2025-002',category:'Water, drainage & karst/sinkhole hazards',stage:'Acknowledged',moderation:'published',created_at:'2025-09-21',resolved_at:null},
    {id:'CS-2026-0003',category:'Public safety',stage:'Submitted',moderation:'pending',created_at:'2026-07-10',resolved_at:null}
  ],
  subscribers:{updates:2,reminders:1},
  recent:[
    {issue_id:'CS-2025-002',stage:'Acknowledged',actor:'Civic Sentinel (independent intake)',note:'Verified against the official TDEC record and logged.',ts:'2025-09-24T15:00:00Z'},
    {issue_id:'CS-2025-001',stage:'Acknowledged',actor:'Civic Sentinel (independent intake)',note:'Received and logged to the public record.',ts:'2025-08-19T14:00:00Z'}
  ],
  health:{db:true,spam:false,time:new Date().toISOString()}
};

async function login(){
  const email=$('#email').value.trim(), password=$('#pw').value;
  if(!email||!password) return notice('Enter your email and password.','err');
  try{
    const r=await fetch(`${CFG.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json',apikey:CFG.SUPABASE_ANON_KEY},body:JSON.stringify({email,password})});
    const j=await r.json();
    if(!r.ok||!j.access_token) return notice(j.error_description||j.msg||'Sign-in failed.','err');
    TOKEN=j.access_token; enterBoard(); load();
  }catch(e){ notice('Sign-in error: '+e.message,'err'); }
}
function enterBoard(){ $('#loginCard').classList.add('hidden'); $('#board').classList.remove('hidden'); $('#logout').classList.remove('hidden'); notice('',''); }

async function fetchStats(){
  const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${TOKEN}`},body:JSON.stringify({action:'stats'})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||('request failed '+r.status));
  return j;
}

function compute(d){
  const iss=d.issues||[];
  const total=iss.length;
  const pending=iss.filter(i=>i.moderation==='pending').length;
  const published=iss.filter(i=>i.moderation==='published').length;
  const rejected=iss.filter(i=>i.moderation==='rejected').length;
  const resolved=iss.filter(i=>i.stage==='Resolved').length;
  const spans=iss.filter(i=>i.resolved_at).map(i=>daysBetween(i.created_at,i.resolved_at)).sort((a,b)=>a-b);
  let median=0; if(spans.length){const m=Math.floor(spans.length/2); median=spans.length%2?spans[m]:Math.round((spans[m-1]+spans[m])/2);}
  const byStage={}, byCat={};
  iss.filter(i=>i.moderation==='published').forEach(i=>{ byStage[i.stage]=(byStage[i.stage]||0)+1; byCat[i.category]=(byCat[i.category]||0)+1; });
  const lastSub=iss.map(i=>i.created_at).sort().slice(-1)[0]||null;
  const subs=(d.subscribers?.updates||0)+(d.subscribers?.reminders||0);
  return {total,pending,published,rejected,resolved,median,byStage,byCat,lastSub,subs,health:d.health||{},recent:d.recent||[]};
}

function bars(obj, container, orderFirst){
  const el=$(container);
  const entries=Object.entries(obj);
  if(!entries.length){ el.innerHTML='<p class="count">No published issues yet.</p>'; return; }
  const max=Math.max(...entries.map(e=>e[1]));
  const order=orderFirst||[];
  entries.sort((a,b)=>{ const ia=order.indexOf(a[0]), ib=order.indexOf(b[0]); if(ia>=0||ib>=0) return (ia<0?99:ia)-(ib<0?99:ib); return b[1]-a[1]; });
  el.innerHTML=entries.map(([k,v])=>`
    <div class="bar-row ${stageClass(k)}"><span class="lab" title="${esc(k)}">${esc(k)}</span>
    <span class="bar" style="width:${Math.max(2,Math.round(v/max*100))}%"></span><span class="v">${v}</span></div>`).join('');
}

function render(s, demo){
  $('#asof').textContent = demo ? '· demo preview' : '· as of '+fmt(new Date().toISOString());
  // status
  const h=s.health||{};
  $('#status').innerHTML = [
    `<div class="stat-item"><span class="dot ${h.db?'g':'r'}"></span>Database ${h.db?'reachable':'unreachable'}</div>`,
    `<div class="stat-item"><span class="dot ${h.spam?'g':'a'}"></span>Spam protection ${h.spam?'ON (Turnstile)':'not configured'}</div>`,
    `<div class="stat-item"><span class="dot ${s.pending>0?'a':'g'}"></span>${s.pending} awaiting moderation</div>`,
    `<div class="stat-item"><span class="dot gr"></span>Last submission: ${s.lastSub?fmt(s.lastSub):'—'}</div>`
  ].join('');
  // KPIs
  $('#kpis').innerHTML = [
    ['Total issues', s.total, ''],
    ['Pending', s.pending, s.pending>0?'alert':''],
    ['Published', s.published, ''],
    ['Resolved', s.resolved, ''],
    ['Median days', s.median, ''],
    ['Subscribers', s.subs, '']
  ].map(([l,n,c])=>`<div class="kpi ${c}"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');
  bars(s.byStage, '#byStage', ['Submitted','Acknowledged','Under review','Action assigned','In progress','Resolved','Closed / no action']);
  bars(s.byCat, '#byCat');
  // feed
  $('#feed').innerHTML = (s.recent||[]).map(e=>`
    <li><span class="mono">${esc(e.issue_id)}</span> → <strong>${esc(e.stage)}</strong> · ${fmt(e.ts)}<br>
    <span class="count">${esc(e.note||'')} — ${esc(e.actor||'')}</span></li>`).join('') || '<li class="count">No activity yet.</li>';
}

async function load(){
  try{ const d=await fetchStats(); render(compute(d), false); }
  catch(e){ notice('Could not load stats: '+e.message,'err'); }
}

document.addEventListener('click',(e)=>{
  if(e.target.id==='login') return login();
  if(e.target.id==='logout'){ TOKEN=null; location.reload(); return; }
  if(e.target.id==='refresh') return load();
});
document.addEventListener('keydown',(e)=>{ if(e.key==='Enter' && !$('#loginCard').classList.contains('hidden')) login(); });

// Boot
if(!CONFIGURED){
  notice('<strong>Demo preview.</strong> No backend is configured yet, so these are sample numbers to show the layout. It shows live data once Supabase is connected and you sign in.','demo');
  $('#loginCard').classList.add('hidden'); $('#board').classList.remove('hidden'); $('#logout').classList.add('hidden');
  render(compute(DEMO), true);
}
