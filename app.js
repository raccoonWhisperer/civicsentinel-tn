/* ==========================================================================
   CIVIC SENTINEL — application logic
   Rutherford County, Tennessee.  "See it. Log it. Track it to resolution."

   ARCHITECTURE NOTE (DB-ready seam)
   --------------------------------------------------------------------------
   Every read/write of issue data goes through the `API` object below. Today
   it is backed by an in-memory array (SEED). To move to a real backend, keep
   the SAME method signatures and swap the bodies for fetch() calls — nothing
   else in this file needs to change. Each method already documents the REST
   endpoint it maps to. See the "HOW TO EXTEND" note at the bottom.
   ========================================================================== */

'use strict';

/* -------------------------------------------------------------------------
   Reference config (from the master-prompt PARAMETERS block)
   ------------------------------------------------------------------------- */
const CATEGORIES = [
  "Infrastructure & roads",
  "Water, drainage & karst/sinkhole hazards",
  "Environmental & drilling concerns",
  "Data centers",
  "Public safety",
  "Zoning & development",
  "Other"
];
const STAGES = ["Submitted","Acknowledged","Under review","Action assigned","In progress","Resolved","Closed / no action"];
// #f-cat is populated from categories present in the data (see syncCatFilter).
let catFilterSig = "";

// Map a stage to a status "family" used for badge colors + counters.
function stageClass(stage){
  if(stage === "Resolved") return "st-done";
  if(stage === "Closed / no action") return "st-closed";
  if(stage === "Submitted" || stage === "Acknowledged") return "st-open";
  return "st-prog"; // Under review / Action assigned / In progress
}

// Poplar Hill / proposed-site anchor for the map (Rutherford County, TN).
const SITE = { lat: 35.9037, lng: -86.5216, label: "Proposed school site (Dismukes farm, Poplar Hill)" };

/* -------------------------------------------------------------------------
   Reference layers — VERIFIED public data only.
   Only the one well tied to a real, citable TDEC log is included. The full
   TDEC well and USGS sinkhole layers should be imported from the official
   feeds before launch; until then those layers are intentionally empty
   rather than populated with unverified points. Coordinates are approximate.
   ------------------------------------------------------------------------- */
const WELLS = [
  { id:"20250267", lat:35.9051, lng:-86.5189, depth:"per TDEC log", voids:"Open voids logged at ~120–121 ft and ~250–251 ft", source:"https://www.tn.gov/environment/program-areas/wr-water-resources.html", label:"TDEC registered well #20250267 (location approximate)" }
];
// USGS sinkhole layer: to be imported from the official USGS karst dataset.
// Left empty on purpose — no invented points.
const SINKS = [];
// Illustrative outline only — replace with the county GIS boundary before launch.
const BOUNDS = [[35.885,-86.545],[35.885,-86.500],[35.920,-86.500],[35.920,-86.545]];

/* -------------------------------------------------------------------------
   SEED DATA — VERIFIED, DOCUMENTED RECORDS ONLY. Mirrors supabase/schema.sql.
   Every entry is a resident report or a reference to a real public document.
   Actor "Civic Sentinel (independent intake)" = this project logged it; it
   does NOT assert that any government office reviewed or acted on the issue.
   ------------------------------------------------------------------------- */
const SEED = [
  {
    id:"CS-2025-001", category:"Environmental & drilling concerns",
    title:"Proposed geothermal drilling at the Poplar Hill school site",
    description:"Residents have asked the county to require a site-specific geophysical survey and an independent geotechnical assessment before any geothermal wells are drilled at the proposed Poplar Hill school site, which sits on karst terrain. The request cites a documented geothermal-drilling failure at a nearby elementary school that damaged a neighboring home and drew a state regulatory violation. Location shown is approximate.",
    location:{ lat:35.9037, lng:-86.5216, address:"Near Poplar Hill Rd, Rutherford County (approximate)" },
    photos:[], reporter_contact:"withheld", created_at:"2025-08-14",
    stage:"Acknowledged", assigned_to:null,
    source_links:[{label:"EFI Global engineering assessment", url:"https://www.efiglobal.com/"},{label:"TDEC Notice of Violation (Sept 5, 2025)", url:"https://www.tn.gov/environment.html"}],
    resolution_summary:null, resolved_at:null,
    stage_history:[
      { stage:"Submitted", timestamp:"2025-08-14", note:"Reported by residents requesting geological testing before any drilling.", actor:"Resident" },
      { stage:"Acknowledged", timestamp:"2025-08-19", note:"Received and logged to the public record by Civic Sentinel. Supporting documents attached. No government action is recorded here unless it is cited to a public document.", actor:"Civic Sentinel (independent intake)" }
    ]
  },
  {
    id:"CS-2025-002", category:"Water, drainage & karst/sinkhole hazards",
    title:"TDEC well log #20250267 records open voids near the proposed site",
    description:"A resident flagged the official TDEC well log for registered well #20250267, which records open voids at roughly 120–121 ft and 250–251 ft — the kind of cavities that make un-surveyed drilling on karst risky. Logged as supporting evidence for the geological-testing request. Location approximate.",
    location:{ lat:35.9051, lng:-86.5189, address:"Near the proposed Poplar Hill site (approximate)" },
    photos:[], reporter_contact:"withheld", created_at:"2025-09-21",
    stage:"Acknowledged", assigned_to:null,
    source_links:[{label:"TDEC well log #20250267 (TDEC Water Resources)", url:"https://www.tn.gov/environment/program-areas/wr-water-resources.html"}],
    resolution_summary:null, resolved_at:null,
    stage_history:[
      { stage:"Submitted", timestamp:"2025-09-21", note:"Public TDEC well log cited by a resident as supporting evidence.", actor:"Resident" },
      { stage:"Acknowledged", timestamp:"2025-09-24", note:"Verified against the official TDEC record and logged.", actor:"Civic Sentinel (independent intake)" }
    ]
  }
];

/* =========================================================================
   API — the swappable data layer (in-memory today, REST tomorrow)
   ========================================================================= */
const API = {
  _issues: SEED.map(x => JSON.parse(JSON.stringify(x))), // deep copy; in-memory store
  _seq: 3, // next id sequence (demo mode)

  /** GET /api/issues  → Issue[] */
  async list(){ return this._issues.slice(); },

  /** GET /api/issues/:id → Issue|null */
  async get(id){ return this._issues.find(i => i.id.toLowerCase() === String(id).toLowerCase()) || null; },

  /** POST /api/issues → created Issue (server would assign id, created_at, first stage) */
  async create(input){
    const id = `CS-2026-${String(this._seq++).padStart(4,"0")}`;
    const today = todayISO();
    const issue = {
      id, category: input.category, title: input.title, description: input.description,
      location: input.location, photos: input.photos || [],
      reporter_contact: input.reporter_contact || "withheld",
      created_at: today, stage: STAGES[0], assigned_to: null,
      source_links: [], resolution_summary: null, resolved_at: null,
      stage_history: [{ stage: STAGES[0], timestamp: today, note: "Report submitted by resident.", actor: "Resident" }]
    };
    this._issues.unshift(issue);
    return issue;
  },

  /** Derived accountability metrics — server could expose GET /api/metrics */
  async metrics(){
    const all = this._issues;
    const logged = all.length;
    const ack = all.filter(i => i.stage !== "Submitted").length;
    const resolved = all.filter(i => i.stage === "Resolved").length;
    const spans = all.filter(i => i.resolved_at)
      .map(i => daysBetween(i.created_at, i.resolved_at)).sort((a,b)=>a-b);
    let median = 0;
    if(spans.length){ const m = Math.floor(spans.length/2);
      median = spans.length % 2 ? spans[m] : Math.round((spans[m-1]+spans[m])/2); }
    return { logged, ack, resolved, median };
  }
};

/* =========================================================================
   LIVE BACKEND WIRING (Supabase) — activates only when config.js provides
   SUPABASE_URL + SUPABASE_ANON_KEY. Otherwise the in-memory demo above runs,
   so this file still previews standalone.
   ========================================================================= */
const CFG = window.CIVIC_CONFIG || {};
const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

async function sb(path){
  const r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: CFG.SUPABASE_ANON_KEY, Authorization: `Bearer ${CFG.SUPABASE_ANON_KEY}` }
  });
  if(!r.ok) throw new Error('supabase rest '+r.status);
  return r.json();
}
async function postJSON(url, body){
  const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const j = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error || ('request failed '+r.status));
  return j;
}
function mapIssue(row, events, sources){
  return {
    id: row.id, category: row.category, title: row.title, description: row.description,
    keywords: row.keywords || '',
    location: { lat: row.lat, lng: row.lng, address: row.address || '' },
    photos: row.photo_url ? [row.photo_url] : [],
    stage: row.stage, assigned_to: row.assigned_to,
    source_links: (sources||[]).filter(s=>s.issue_id===row.id).map(s=>({label:s.label,url:s.url})),
    resolution_summary: row.resolution_summary,
    resolved_at: row.resolved_at ? String(row.resolved_at).slice(0,10) : null,
    created_at: String(row.created_at||'').slice(0,10),
    stage_history: (events||[]).filter(e=>e.issue_id===row.id)
      .sort((a,b)=>String(a.ts).localeCompare(String(b.ts)))
      .map(e=>({stage:e.stage, timestamp:String(e.ts).slice(0,10), note:e.note, actor:e.actor}))
  };
}
function readFileDataUrl(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

if (LIVE) {
  API.list = async function(){
    const [issues, events, sources] = await Promise.all([
      sb('issues_public?select=*&order=created_at.desc'),
      sb('issue_events?select=*&order=ts.asc'),
      sb('issue_sources?select=*')
    ]);
    return issues.map(row => mapIssue(row, events, sources));
  };
  API.get = async function(id){
    const rows = await sb(`issues_public?id=eq.${encodeURIComponent(id)}&select=*`);
    if(!rows[0]) return null;
    const [events, sources] = await Promise.all([
      sb(`issue_events?issue_id=eq.${encodeURIComponent(id)}&select=*&order=ts.asc`),
      sb(`issue_sources?issue_id=eq.${encodeURIComponent(id)}&select=*`)
    ]);
    return mapIssue(rows[0], events, sources);
  };
  API.create = async function(input){
    let token = '';
    try { token = window.turnstile ? window.turnstile.getResponse(window.__tsWidgetId) : ''; } catch(e){}
    const j = await postJSON('/api/report', {
      category: input.category, title: input.title, description: input.description,
      lat: input.location?.lat, lng: input.location?.lng, address: input.location?.address,
      contact: input.reporter_contact, name: input.reporter_name || '',
      photoDataUrl: input.photoDataUrl || null, turnstileToken: token || '',
      hp: (document.querySelector('#r-hp') && document.querySelector('#r-hp').value) || ''
    });
    return { id: j.id, _pending: true, stage: 'Submitted', category: input.category, title: input.title, location: input.location };
  };
  API.metrics = async function(){
    const all = await this.list();
    const logged = all.length;
    const ack = all.filter(i=>i.stage!=='Submitted').length;
    const resolved = all.filter(i=>i.stage==='Resolved').length;
    const spans = all.filter(i=>i.resolved_at).map(i=>daysBetween(i.created_at,i.resolved_at)).sort((a,b)=>a-b);
    let median=0; if(spans.length){ const m=Math.floor(spans.length/2); median=spans.length%2?spans[m]:Math.round((spans[m-1]+spans[m])/2); }
    return { logged, ack, resolved, median };
  };
}
function initTurnstile(){
  if(!(LIVE && CFG.TURNSTILE_SITEKEY)) return;
  const s=document.createElement('script');
  s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; s.async=true; s.defer=true;
  s.onload=()=>{ try{ window.__tsWidgetId = window.turnstile.render('#ts-widget',{ sitekey: CFG.TURNSTILE_SITEKEY, theme:'light' }); }catch(e){} };
  document.head.appendChild(s);
}

/* small date helpers */
function todayISO(){ const d = new Date(); return d.toISOString().slice(0,10); }
function daysBetween(a,b){ return Math.round((new Date(b) - new Date(a)) / 86400000); }
function fmtDate(iso){ const d = new Date(iso+"T00:00:00");
  return d.toLocaleDateString(currentLang==="es"?"es-US":"en-US",{year:"numeric",month:"short",day:"numeric"}); }

/* =========================================================================
   i18n — English / Spanish
   ========================================================================= */
let currentLang = "en";
const I18N = {
  en:{}, // English is authored inline in the HTML (data-i18n defaults); es overrides.
  es:{
    "skip":"Saltar al contenido","util.about":"Acerca de","util.news":"Sala de prensa","util.contact":"Contacto","util.data":"Rendición de cuentas",
    "util.tag":"Un registro público independiente · Condado de Rutherford, Tennessee",
    "brand.sub":"Condado de Rutherford, TN",
    "nav.home":"Inicio","nav.issues":"Registro","nav.map":"El mapa","nav.know":"Conoce el tema","nav.action":"Toma acción","nav.account":"Rendición de cuentas",
    "cta.track":"Rastrear un caso","cta.report":"Reportar un caso",
    "hero.serving":"<strong>Ahora sirviendo:</strong> infraestructura y carreteras · agua, drenaje y peligros kársticos · medio ambiente y perforación · seguridad pública · zonificación y desarrollo",
    "hero.s1":"Casos en el registro público","hero.s2":"Rastreados hasta su resolución","hero.s3":"Fuentes de datos oficiales","hero.s4":"Público y solo-añadir",
    "cred.label":"Construido sobre registros públicos oficiales","cred.tdec":"Recursos Hídricos","cred.usgs":"Mapeo Kárstico","cred.gis":"SIG","cred.efi":"Ingeniería",
    "pillar.eyebrow":"Cómo funciona Civic Sentinel","pillar.title":"Un camino único y responsable, de la preocupación a la resolución","pillar.lead":"Tres pasos, en un registro público. Nada se borra; cada caso avanza a la vista.",
    "pillar.report.t":"Reportar","pillar.report.d":"Marca un problema donde ocurre. Un formulario guiado coloca un pin, registra los detalles y te da un número de seguimiento.","pillar.report.l":"Iniciar un reporte →",
    "pillar.track.t":"Rastrear","pillar.track.d":"Cada reporte recibe una línea de tiempo pública. Observa cada cambio de estado con la fecha, la nota y quién actuó.","pillar.track.l":"Ver el registro →",
    "pillar.resolve.t":"Resolver","pillar.resolve.d":"Rendición de cuentas a la vista. Contadores en vivo muestran lo registrado, reconocido y resuelto — y cuánto tomó.","pillar.resolve.l":"Ver el historial →",
    "recent.eyebrow":"Del registro público","recent.title":"Reportado recientemente","recent.all":"Ver todos los casos →",
    "map.eyebrow":"Lo que hay debajo y alrededor","map.title":"El mapa","map.lead":"Busca tu calle, activa las capas y observa la cercanía tú mismo. Los casos reportados aparecen junto a los datos oficiales — pozos TDEC, sumideros USGS y límites de distritos.",
    "map.go":"Ir","map.layers":"Capas del mapa","map.l.issues":"Casos reportados","map.l.issues.d":"Por categoría y estado actual","map.l.sink.d":"Sumideros y depresiones documentados","map.l.wells.d":"Pozos de agua registrados — con enlaces","map.l.bounds":"Límites","map.l.bounds.d":"Jurisdicción y distritos","map.tip":"Consejo: al reportar, haz clic en el mapa para ubicar tu caso.","map.src":"Fuentes: TDEC; Mapa kárstico USGS; SIG del Condado. Solo se muestran puntos verificados; las capas oficiales completas se importan antes del lanzamiento. Las ubicaciones son aproximadas.",
    "acc.eyebrow":"Rendición de cuentas","acc.title":"El historial, a la vista","acc.lead":"Estos contadores se calculan en vivo con cada caso del registro público. Ningún caso se edita ni se borra — solo avanza en su ciclo.",
    "acc.logged":"Casos registrados","acc.ack":"Reconocidos","acc.resolved":"Resueltos","acc.median":"Días medianos hasta resolución",
    "acc.logged.s":"En el registro público","acc.ack.s":"Recibidos y encaminados","acc.resolved.s":"Cerrados con resumen","acc.median.s":"Entre casos resueltos",
    "recent.title":"Recientemente en el registro",
    "upd.sub.note":"Recibirás un correo de confirmación. Nunca compartimos tu dirección.",
    "log.eyebrow":"Buscar y filtrar","log.title":"Registro público de casos","log.f.cat":"Categoría","log.f.status":"Estado","log.f.sort":"Ordenar por","log.f.q":"Palabra clave","log.sort.new":"Más recientes","log.sort.old":"Más antiguos","log.sort.open":"Más tiempo abiertos",
    "know.eyebrow":"Conoce el tema","know.title":"Karst 101 — el suelo bajo el Condado de Rutherford",
    "know.p1":"Gran parte del condado está sobre <strong>karst</strong> — piedra caliza que el agua subterránea disuelve lentamente en cuevas y vacíos. Capas delgadas de arcilla suelen puentear esos vacíos cerca de la superficie. Cuando la perforación o construcción pesada altera ese puente, el suelo puede asentarse, agrietarse o colapsar.",
    "know.p2":"Esto no es hipotético aquí. Los registros del condado documentan un proyecto de pozo geotérmico en una escuela existente que dañó una casa vecina y provocó una violación regulatoria estatal. Por eso <em>probar antes de construir</em> es el objetivo.",
    "know.callout":"<strong>En el registro:</strong> un pozo registrado cerca del sitio propuesto registró vacíos abiertos a ~120–121 pies y de nuevo a 250–251 pies — cavidades como las que hacen riesgosa la perforación sin estudio.",
    "know.right.t":"Hacerlo bien — antes de construir de nuevo",
    "know.right.1":"<strong>Estudios geofísicos</strong> no invasivos (resistividad eléctrica, microgravedad) para ver los vacíos antes de perforar.",
    "know.right.2":"Una <strong>evaluación geotécnica específica del sitio</strong> — no una suposición regional genérica.",
    "know.right.3":"<strong>Mapeo detallado de rasgos kársticos</strong>: sumideros, manantiales y depresiones dentro y alrededor de la parcela.",
    "know.right.4":"Decisiones tomadas <strong>después</strong> de tener la evidencia — no antes.",
    "know.right.5":"Hallazgos publicados en <strong>lenguaje claro</strong> para que los residentes puedan leerlos.",
    "know.right.6":"Una revisión <strong>independiente</strong>, para que el constructor no califique su propia tarea.",
    "act.eyebrow":"Toma acción","act.title":"Haz que tu voz sea parte del registro",
    "act.msg.t":"Escribe a tus autoridades — carta de 60 segundos","act.msg.d":"Edítala libremente, luego cópiala en un correo o léela en una reunión. Está dirigida a comisionados del condado, miembros de la junta escolar y legisladores estatales.","act.msg.copy":"Copiar mensaje","act.msg.reset":"Restablecer",
    "act.contacts.t":"A quién contactar","act.contacts.1":"Comisionados del Condado","act.contacts.1d":"— encuentra tu representante","act.contacts.2":"Junta de Educación","act.contacts.2d":"— miembros y agendas","act.contacts.3":"Legisladores Estatales",
    "act.share.t":"Difunde · Comparte",
    "act.meet.t":"Próximas reuniones","act.meet.d":"Los periodos de comentario público permiten hablar a los residentes. Llega temprano, firma la lista, respeta el límite de tiempo y cíñete a los hechos.",
    "act.remind.t":"Recordatorios de reuniones","act.remind.d":"Recibe un aviso antes de fechas clave. Sin spam, sin compartir, cancela cuando quieras.","act.remind.email":"Correo","act.remind.btn":"Recuérdame",
    "upd.eyebrow":"Novedades","upd.title":"Lo nuevo","upd.sub.t":"Recibe novedades por correo","upd.sub.d":"Un resumen breve cuando los casos cambian de estado o se añaden registros. Sin spam, cancela cuando quieras.","upd.sub.email":"Correo electrónico","upd.sub.btn":"Suscribirse",
    "foot.tag":"Verlo. Registrarlo. Rastrearlo hasta resolverlo. Un registro público y transparente de los casos de la comunidad.","foot.explore":"Explorar","foot.act":"Participar","foot.contact":"Contacto y jurisdicción","foot.serves":"Sirviendo al Condado de Rutherford, TN","foot.privacy":"Privacidad","foot.access":"Declaración de accesibilidad","foot.terms":"Términos",
    "foot.disclaimer":"Este sitio ofrece información educativa y cívica general y un registro público de casos. No es asesoría legal ni de ingeniería, y no toma posición sobre ningún litigio en curso. Los datos de referencia (TDEC, USGS, SIG del condado) se muestran como contexto; confirma siempre con la fuente oficial.",
    "report.title":"Reportar un caso","report.s1":"1 · Qué","report.s2":"2 · Dónde","report.s3":"3 · Tú",
    "report.cat":"Categoría","report.summary":"Resumen breve","report.desc":"Describe lo que ves","report.photo":"Foto (opcional)","report.photo.d":"Una foto ayuda a priorizar más rápido.","report.next":"Siguiente: ¿dónde es? →","report.addr":"Dirección o esquina más cercana","report.map.d":"Haz clic en el mapa para ubicar el punto exacto.","report.back":"← Atrás","report.next3":"Siguiente: tu contacto →","report.name":"Tu nombre (opcional)","report.contact":"Correo o teléfono para novedades","report.contact.d":"Solo lo usamos para enviarte cambios de estado. Nunca se muestra públicamente.","report.submit":"Enviar reporte","report.done.t":"Reporte enviado","report.done.d":"Gracias. Tu caso está ahora en el registro público en la etapa <strong>Enviado</strong>. Guarda tu número de seguimiento:","report.done.view":"Ver mi caso","report.done.close":"Cerrar",
    "track.title":"Rastrear un caso","track.d":"Ingresa un número de seguimiento (por ejemplo <span class='mono'>CS-2026-0142</span>) o explora el registro público completo.","track.find":"Buscar","track.err":"No se encontró ningún caso con ese número. Verifica el código e intenta de nuevo.","track.browse":"O explora el registro completo →",
    "detail.reported":"Reportado","detail.stage":"Etapa actual","detail.assigned":"Asignado a","detail.sources":"Documentos fuente","detail.timeline":"Línea de tiempo del caso","detail.resolution":"Resumen de resolución","detail.share":"Compartir este caso","detail.none":"—",
    "toast.copied":"Mensaje copiado al portapapeles","toast.reset":"Plantilla restablecida","toast.sub":"¡Suscrito! Revisa tu correo para confirmar.","toast.remind":"¡Listo! Te avisaremos antes de fechas clave.","toast.pin":"Ubicación fijada","toast.reqfields":"Completa los campos requeridos.","toast.langset":"Idioma: Español"
  }
};
const TEMPLATE = {
  en:`Dear Commissioner / Board Member / Representative,

I am a resident of Rutherford County writing about the proposed construction on karst terrain at the Poplar Hill site. Before any drilling or heavy construction begins, I ask that the county require a site-specific geophysical survey and an independent geotechnical assessment, with the findings published in plain language.

We have already seen what happens when this step is skipped: a geothermal-well project at a nearby school damaged a neighboring home and drew a state regulatory violation. Testing before we build is not an obstacle — it is basic due diligence that protects children, homeowners, and public funds.

Please make rigorous geological testing a condition of approval.

Respectfully,
[Your name]
[Your address / district]`,
  es:`Estimado(a) Comisionado(a) / Miembro de la Junta / Representante:

Soy residente del Condado de Rutherford y escribo sobre la construcción propuesta en terreno kárstico en el sitio de Poplar Hill. Antes de que comience cualquier perforación o construcción pesada, pido que el condado exija un estudio geofísico específico del sitio y una evaluación geotécnica independiente, con los hallazgos publicados en lenguaje claro.

Ya vimos lo que ocurre cuando se omite este paso: un proyecto de pozo geotérmico en una escuela cercana dañó una casa vecina y provocó una violación regulatoria estatal. Probar antes de construir no es un obstáculo — es diligencia básica que protege a los niños, a los propietarios y a los fondos públicos.

Por favor, hagan de las pruebas geológicas rigurosas una condición de aprobación.

Atentamente,
[Su nombre]
[Su dirección / distrito]`
};
const MEETINGS = [
  { day:"22", mon:{en:"JUL",es:"JUL"}, title:{en:"County Commission — regular session",es:"Comisión del Condado — sesión ordinaria"}, detail:{en:"6:00 PM · County Courthouse. Public comment at the start.",es:"6:00 PM · Palacio del Condado. Comentario público al inicio."} },
  { day:"05", mon:{en:"AUG",es:"AGO"}, title:{en:"Board of Education — work session",es:"Junta de Educación — sesión de trabajo"}, detail:{en:"5:30 PM · District office. Sign up to speak by 5:15.",es:"5:30 PM · Oficina del distrito. Regístrate para hablar antes de las 5:15."} },
  { day:"14", mon:{en:"AUG",es:"AGO"}, title:{en:"Planning Commission — public hearing",es:"Comisión de Planificación — audiencia pública"}, detail:{en:"6:00 PM · Annex Room B. Karst-overlay item on the agenda.",es:"6:00 PM · Sala B. Tema de superposición kárstica en la agenda."} }
];
const UPDATES = [
  { date:"2026-07-06", t:{en:"New reference item: Old Lascassas main breaks",es:"Nuevo caso: roturas en Old Lascassas"}, b:{en:"A recurrent water-main break was logged and linked to the karst-prone segment for investigation.",es:"Se registró una rotura recurrente de tubería y se vinculó al segmento kárstico para investigación."} },
  { date:"2025-09-08", t:{en:"Poplar Hill drilling case moved to Under review",es:"Caso de perforación pasa a En revisión"}, b:{en:"The county opened a geotech review and added the TDEC Notice of Violation to the file.",es:"El condado abrió una revisión geotécnica y añadió el aviso de violación de TDEC al expediente."} },
  { date:"2024-12-01", t:{en:"Franklin Rd shoulder repair resolved",es:"Reparación de Franklin Rd resuelta"}, b:{en:"A subsurface void was grouted and the shoulder rebuilt, closing the issue after clear monitoring.",es:"Se rellenó un vacío subterráneo y se reconstruyó el arcén, cerrando el caso tras el monitoreo."} }
];

/* =========================================================================
   Rendering
   ========================================================================= */
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
function t(key){ return currentLang==="es" && I18N.es[key] ? I18N.es[key] : null; }

function badge(stage){
  const cls = stageClass(stage);
  const label = STAGES.includes(stage) ? stageLabel(stage) : stage;
  return `<span class="badge ${cls}">${label}</span>`;
}
function stageLabel(stage){
  if(currentLang!=="es") return stage;
  const m = {"Submitted":"Enviado","Acknowledged":"Reconocido","Under review":"En revisión","Action assigned":"Acción asignada","In progress":"En progreso","Resolved":"Resuelto","Closed / no action":"Cerrado / sin acción"};
  return m[stage]||stage;
}
function catLabel(cat){
  if(currentLang!=="es") return cat;
  const m = {
    "Infrastructure & roads":"Infraestructura y carreteras",
    "Water, drainage & karst/sinkhole hazards":"Agua, drenaje y peligros kársticos",
    "Environmental & drilling concerns":"Medio ambiente y perforación",
    "Data centers":"Centros de datos",
    "Public safety":"Seguridad pública",
    "Zoning & development":"Zonificación y desarrollo","Other":"Otro"};
  return m[cat]||cat;
}
const pinSvg = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" style="display:inline-block"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2"/></svg>`;

async function renderCarousel(){
  const items = (await API.list()).slice(0,6);
  $("#carousel").innerHTML = items.map(i=>`
    <button class="issue-card" data-issue="${i.id}">
      <span class="cat">${catLabel(i.category)}</span>
      <h4>${esc(i.title)}</h4>
      ${badge(i.stage)}
      <span class="loc">${pinSvg} ${esc(i.location.address)}</span>
    </button>`).join("");
}

async function renderLog(){
  const cat = $("#f-cat").value, status = $("#f-status").value, sort = $("#f-sort").value, q = $("#f-q").value.trim().toLowerCase();
  let items = await API.list();
  syncCatFilter(items, cat);
  if(cat!=="all") items = items.filter(i=>i.category===cat);
  if(status!=="all") items = items.filter(i=>stageClass(i.stage)===status);
  if(q) items = items.filter(i=>(i.title+" "+i.description+" "+(i.keywords||"")+" "+i.location.address+" "+i.id).toLowerCase().includes(q));
  if(sort==="new") items.sort((a,b)=> b.created_at.localeCompare(a.created_at));
  if(sort==="old") items.sort((a,b)=> a.created_at.localeCompare(b.created_at));
  if(sort==="open") items.sort((a,b)=> openDays(b)-openDays(a));
  const countMsg = currentLang==="es" ? `${items.length} caso(s)` : `${items.length} issue(s)`;
  $("#log-count").textContent = countMsg;
  $("#logList").innerHTML = items.map(i=>`
    <button class="log-row" data-issue="${i.id}">
      <span class="id">${i.id}</span>
      <span><h4>${esc(i.title)}</h4><span class="meta">${catLabel(i.category)} · ${pinSvg} ${esc(i.location.address)} · ${fmtDate(i.created_at)}</span></span>
      ${badge(i.stage)}
    </button>`).join("") || `<p class="hint">${currentLang==="es"?"Ningún caso coincide con los filtros.":"No issues match these filters."}</p>`;
}
function openDays(i){ return daysBetween(i.created_at, i.resolved_at || todayISO()); }

function syncCatFilter(items, keep){
  const sel = $("#f-cat"); if(!sel) return;
  const cats = [...new Set(items.map(i=>i.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const sig = currentLang + "::" + cats.join("|");
  if(sig === catFilterSig) return;
  catFilterSig = sig;
  const allLabel = currentLang==="es" ? "Todas las categorías" : "All categories";
  sel.innerHTML = `<option value="all">${allLabel}</option>` +
    cats.map(c=>`<option value="${c}">${esc(catLabel(c))}</option>`).join("");
  if(keep && (keep==="all" || cats.includes(keep))) sel.value = keep;
}

async function renderCounters(){
  const m = await API.metrics();
  animateTo("#c-logged", m.logged); animateTo("#c-ack", m.ack);
  animateTo("#c-resolved", m.resolved); animateTo("#c-median", m.median);
}
function animateTo(sel,val){
  const el=$(sel); if(!el) return; const start=+el.textContent||0; const t0=performance.now();
  if(matchMedia("(prefers-reduced-motion:reduce)").matches){ el.textContent=val; return; }
  (function step(t){ const p=Math.min((t-t0)/700,1); el.textContent=Math.round(start+(val-start)*p);
    if(p<1) requestAnimationFrame(step); })(t0);
}

function renderMeetings(){
  $("#meetings").innerHTML = MEETINGS.map(m=>`
    <div class="meeting"><div class="date"><div class="d">${m.day}</div><div class="m">${m.mon[currentLang]||m.mon.en}</div></div>
    <div><strong>${m.title[currentLang]||m.title.en}</strong><br><span class="hint">${m.detail[currentLang]||m.detail.en}</span></div></div>`).join("");
}
function renderUpdates(){
  $("#updatesList").innerHTML = UPDATES.map(u=>`
    <div class="panel" style="margin-bottom:14px"><span class="hint">${fmtDate(u.date)}</span>
    <h3 style="margin:4px 0 6px">${u.t[currentLang]||u.t.en}</h3><p style="margin:0">${u.b[currentLang]||u.b.en}</p></div>`).join("");
}
function renderShare(){
  const url = "https://beforewebuildagain.com/";
  const msg = currentLang==="es" ? "Verlo. Registrarlo. Rastrearlo hasta resolverlo." : "See it. Log it. Track it to resolution.";
  const enc = encodeURIComponent, u = enc(url), m = enc(msg);
  const links = [
    ["X",`https://twitter.com/intent/tweet?url=${u}&text=${m}`],
    ["Nextdoor",`https://nextdoor.com/sharekit/?source=${u}`],
    ["WhatsApp",`https://wa.me/?text=${m}%20${u}`],
    ["Text",`sms:?&body=${m}%20${u}`]
  ];
  $("#shareRow").innerHTML = links.map(([n,h])=>`<a href="${h}" target="_blank" rel="noopener">${n}</a>`).join("");
}

function esc(s){ return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* -------- Issue detail (public lifecycle timeline) -------- */
async function openDetail(id){
  const i = await API.get(id); if(!i) return;
  const L = (k,en)=> t(k)||en;
  const sources = i.source_links.length
    ? `<h4 style="margin-top:18px">${L("detail.sources","Source documents")}</h4><ul class="contact-list">${i.source_links.map(s=>`<li><a href="${s.url}" target="_blank" rel="noopener">${esc(s.label)} ↗</a></li>`).join("")}</ul>`
    : "";
  const resolution = i.resolution_summary
    ? `<div class="callout" style="background:var(--green-bg);border-color:var(--green);margin-top:16px"><strong>${L("detail.resolution","Resolution summary")}:</strong> ${esc(i.resolution_summary)} <span class="hint">(${fmtDate(i.resolved_at)})</span></div>`
    : "";
  const timeline = `<ol class="timeline">${i.stage_history.map((h,idx)=>`
    <li class="tl-item ${idx===i.stage_history.length-1?"is-current":""}">
      <div class="tl-stage">${stageLabel(h.stage)}</div>
      <div class="tl-when">${fmtDate(h.timestamp)}</div>
      <div class="tl-note">${esc(h.note)}</div>
      <div class="tl-actor">— ${esc(h.actor)}</div>
    </li>`).join("")}</ol>`;
  const shareUrl = encodeURIComponent("https://beforewebuildagain.com/#"+i.id);
  $("#detail-title").innerHTML = `<span class="mono" style="font-size:.8rem;color:var(--ink-soft)">${i.id}</span><br>${esc(i.title)}`;
  $("#detailBody").innerHTML = `
    ${badge(i.stage)}
    <span class="cat" style="color:var(--blue);font-weight:700;font-size:.78rem;text-transform:uppercase;letter-spacing:.06em">${catLabel(i.category)}</span>
    <p style="margin-top:12px">${esc(i.description)}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 20px;margin:16px 0;font-size:.92rem">
      <div><strong>${L("detail.reported","Reported")}:</strong> ${fmtDate(i.created_at)}</div>
      <div><strong>${pinSvg} ${esc(i.location.address)}</strong></div>
      <div><strong>${L("detail.stage","Current stage")}:</strong> ${stageLabel(i.stage)}</div>
      <div><strong>${L("detail.assigned","Assigned to")}:</strong> ${i.assigned_to?esc(i.assigned_to):L("detail.none","—")}</div>
    </div>
    ${resolution}
    ${sources}
    <h4 style="margin-top:20px">${L("detail.timeline","Issue lifecycle timeline")}</h4>
    <p class="hint">${currentLang==="es"?"Registro transparente y solo-añadir: ninguna entrada se edita ni se borra. Las entradas marcadas «Civic Sentinel» son registro independiente de este proyecto; las acciones de una oficina gubernamental solo aparecen cuando se citan a un documento público.":"Transparent, append-only trail — no entry is edited or deleted. Entries marked “Civic Sentinel” are independent intake by this project; a government office's action appears only when it is cited to a public document."}</p>
    ${timeline}
    <div class="share" style="margin-top:16px">
      <a href="https://twitter.com/intent/tweet?url=${shareUrl}" target="_blank" rel="noopener">X</a>
    </div>`;
  showDialog("#dlg-detail");
}

/* =========================================================================
   Maps (Leaflet)
   ========================================================================= */
let mainMap, reportMap, reportMarker, layerGroups={};
function catColor(cat){
  return {
    "Infrastructure & roads":"#7c3aed",
    "Water, drainage & karst/sinkhole hazards":"#2563a8",
    "Environmental & drilling concerns":"#0f766e",
    "Data centers":"#db2777",
    "Public safety":"#b91c1c",
    "Zoning & development":"#b45309",
    "Other":"#475569"
  }[cat]||"#1F3A5F";
}
function dot(color){ return L.divIcon({className:"", html:`<div style="width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3)"></div>`, iconSize:[16,16], iconAnchor:[8,8]}); }
function star(){ return L.divIcon({className:"", html:`<div style="font-size:26px;line-height:1;color:#1F3A5F;text-shadow:0 0 3px #fff,0 0 3px #fff">★</div>`, iconSize:[26,26], iconAnchor:[13,13]}); }

async function initMainMap(){
  if(!window.L){ return; }
  mainMap = L.map("leafmap",{scrollWheelZoom:false}).setView([SITE.lat, SITE.lng], 14);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19, attribution:"© OpenStreetMap"}).addTo(mainMap);
  mainMap.on("click",()=>mainMap.scrollWheelZoom.enable());

  // proposed site
  L.marker([SITE.lat,SITE.lng],{icon:star()}).addTo(mainMap).bindPopup(`<h4>★ ${SITE.label}</h4><p class="hint">The parcel at the center of the Poplar Hill review.</p>`);

  layerGroups.issues = L.layerGroup().addTo(mainMap);
  layerGroups.sink   = L.layerGroup().addTo(mainMap);
  layerGroups.wells  = L.layerGroup().addTo(mainMap);
  layerGroups.bounds = L.layerGroup();

  const issues = await API.list();
  issues.forEach(i=>{
    L.marker([i.location.lat,i.location.lng],{icon:dot(catColor(i.category))})
     .addTo(layerGroups.issues)
     .bindPopup(`<h4>${esc(i.title)}</h4><p>${badge(i.stage)}<br><span class="hint">${catLabel(i.category)}</span></p><p><a href="#" onclick="openDetail('${i.id}');return false;">View full timeline →</a></p>`);
  });
  SINKS.forEach(s=>{
    L.circleMarker([s.lat,s.lng],{radius:8,color:"#b45309",fillColor:"#f59e0b",fillOpacity:.75,weight:2})
     .addTo(layerGroups.sink)
     .bindPopup(`<h4>${s.label}</h4><p>${s.size}</p><p><a href="${s.source}" target="_blank" rel="noopener">USGS source ↗</a></p>`);
  });
  WELLS.forEach(w=>{
    L.circleMarker([w.lat,w.lng],{radius:7,color:"#0e7490",fillColor:"#22d3ee",fillOpacity:.8,weight:2})
     .addTo(layerGroups.wells)
     .bindPopup(`<h4>${w.label}</h4><p>Depth: ${w.depth}<br>${w.voids}</p><p><a href="${w.source}" target="_blank" rel="noopener">TDEC well log ↗</a></p>`);
  });
  L.polygon(BOUNDS,{color:"#1F3A5F",weight:2,dashArray:"6 5",fill:false}).addTo(layerGroups.bounds);

  // layer toggles
  $$('[data-layer]').forEach(cb=>{
    cb.addEventListener("change",()=>{
      const g = layerGroups[cb.dataset.layer]; if(!g) return;
      if(cb.checked) g.addTo(mainMap); else mainMap.removeLayer(g);
    });
  });

  $("#mapSearchBtn").addEventListener("click", ()=>geocode($("#mapSearch").value, mainMap));
  $("#mapSearch").addEventListener("keydown", e=>{ if(e.key==="Enter") geocode($("#mapSearch").value, mainMap); });
  setTimeout(()=>mainMap.invalidateSize(),200);
}

// Simple geocode via Nominatim (best-effort; degrades gracefully offline).
async function geocode(q, map){
  if(!q||!q.trim()) return;
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q+" Rutherford County TN")}`);
    const j = await r.json();
    if(j[0]){ map.setView([+j[0].lat,+j[0].lon], 15); }
    else toast(currentLang==="es"?"Dirección no encontrada.":"Address not found.");
  }catch(e){ toast(currentLang==="es"?"Búsqueda no disponible sin conexión.":"Search unavailable offline."); }
}

function initReportMap(){
  if(!window.L || reportMap) { if(reportMap) setTimeout(()=>reportMap.invalidateSize(),150); return; }
  reportMap = L.map("rmap").setView([SITE.lat,SITE.lng],13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(reportMap);
  reportMap.on("click",e=>{
    if(reportMarker) reportMarker.setLatLng(e.latlng);
    else reportMarker = L.marker(e.latlng,{icon:dot("#1F3A5F")}).addTo(reportMap);
    draft.location.lat = +e.latlng.lat.toFixed(5); draft.location.lng = +e.latlng.lng.toFixed(5);
    $("#r-coords").textContent = `(${draft.location.lat}, ${draft.location.lng})`;
    toast(t("toast.pin")||"Location pinned");
  });
  $("#r-addr-btn").addEventListener("click", ()=>geocode($("#r-addr").value, reportMap));
  setTimeout(()=>reportMap.invalidateSize(),200);
}

/* =========================================================================
   Report flow
   ========================================================================= */
let draft = { location:{lat:null,lng:null,address:""} };
function gotoStep(n){
  $$('[data-panel]').forEach(p=>p.hidden = (+p.dataset.panel!==n));
  $$('.step-pill').forEach(s=>{ const k=+s.dataset.step;
    s.classList.toggle("active", k===n); s.classList.toggle("done", k<n); });
  if(n===2) initReportMap();
}
async function submitReport(){
  const title = $("#r-title").value.trim(), desc = $("#r-desc").value.trim(), cat = $("#r-cat").value;
  if(!title||!desc||!cat){ toast(t("toast.reqfields")||"Please complete the required fields."); gotoStep(1); return; }
  draft.location.address = $("#r-addr").value.trim() || (draft.location.lat?`Pinned (${draft.location.lat}, ${draft.location.lng})`:"Location pending");
  const file = $("#r-photo").files[0];
  let photoDataUrl = null;
  try { if(file && file.size <= 6*1024*1024) photoDataUrl = await readFileDataUrl(file); } catch(e){}
  let issue;
  const submitBtn = $("#submitReport");
  if(submitBtn){ submitBtn.disabled = true; }
  try {
    issue = await API.create({
      category:cat, title, description:desc, location:{...draft.location},
      photos: file?[file.name]:[], photoDataUrl,
      reporter_contact: $("#r-contact").value.trim()||"withheld",
      reporter_name: $("#r-name").value.trim()
    });
  } catch(err){
    if(submitBtn){ submitBtn.disabled = false; }
    toast((currentLang==="es"?"No se pudo enviar: ":"Could not submit: ")+(err.message||""));
    return;
  }
  if(submitBtn){ submitBtn.disabled = false; }
  $("#reportForm").hidden = true; $("#reportDone").hidden = false;
  $("#newId").textContent = issue.id;
  if(issue._pending){
    // Live mode: submission awaits moderator approval before it is public.
    const msg = $("#reportDoneMsg");
    if(msg) msg.innerHTML = currentLang==="es"
      ? "Gracias. Tu caso fue <strong>enviado para revisión</strong> y aparecerá en el registro público una vez que un moderador lo apruebe. Guarda tu número de seguimiento:"
      : "Thank you. Your report was <strong>submitted for review</strong> and will appear on the public record once an operator approves it. Save your tracking ID:";
    $("#viewNew").hidden = true;
  } else {
    $("#viewNew").hidden = false;
    $("#viewNew").onclick = ()=>{ closeDialogs(); openDetail(issue.id); };
    renderCarousel(); renderLog(); renderCounters(); refreshMapIssue(issue);
  }
}
function refreshMapIssue(i){
  if(layerGroups.issues){
    L.marker([i.location.lat||SITE.lat, i.location.lng||SITE.lng],{icon:dot(catColor(i.category))})
     .addTo(layerGroups.issues)
     .bindPopup(`<h4>${esc(i.title)}</h4><p>${badge(i.stage)}</p><p><a href="#" onclick="openDetail('${i.id}');return false;">View full timeline →</a></p>`);
  }
}
function resetReport(){
  draft = { location:{lat:null,lng:null,address:""} };
  ["r-title","r-desc","r-addr","r-name","r-contact"].forEach(id=>$("#"+id).value="");
  $("#r-photo").value=""; $("#r-coords").textContent=""; $("#r-cat").selectedIndex=0;
  if(reportMarker){ reportMap.removeLayer(reportMarker); reportMarker=null; }
  $("#reportForm").hidden=false; $("#reportDone").hidden=true; gotoStep(1);
}

/* =========================================================================
   Dialog helpers
   ========================================================================= */
function showDialog(sel){ const d=$(sel); if(d.showModal) d.showModal(); else d.setAttribute("open",""); }
function closeDialogs(){ $$("dialog").forEach(d=>{ if(d.open){ d.close?d.close():d.removeAttribute("open"); } }); }

/* =========================================================================
   Language
   ========================================================================= */
function applyLang(lang){
  currentLang = lang;
  document.documentElement.lang = lang;
  $$('[data-lang]').forEach(b=>b.setAttribute("aria-pressed", String(b.dataset.lang===lang)));
  // static strings
  $$('[data-i18n]').forEach(el=>{
    const key = el.getAttribute("data-i18n");
    if(lang==="es" && I18N.es[key]!=null){ el.innerHTML = I18N.es[key]; el.dataset.en ??= el.getAttribute("data-en")||""; }
    else if(lang==="en" && el.dataset.enHtml){ el.innerHTML = el.dataset.enHtml; }
  });
  // hero (special)
  applyHeroLang();
  // template + dynamic
  $("#tmpl").value = TEMPLATE[lang];
  populateSelects();
  renderCarousel(); renderLog(); renderCounters(); renderHeroStats(); renderMeetings(); renderUpdates(); renderShare();
}
// Preserve English originals so we can toggle back.
function cacheEnglish(){ $$('[data-i18n]').forEach(el=>{ el.dataset.enHtml = el.innerHTML; }); }
// Rotating hero messages (3 per language) — content rotates over a fixed backdrop.
const HERO = {
  en:[
    {eyebrow:"A public record for our community", title:"See it. Log it. Track it to resolution.", tag:"An independent, transparent record of community issues in Rutherford County — reported by residents, followed publicly from the moment each is acknowledged to the day it is resolved."},
    {eyebrow:"Before we build again", title:"Test the ground before we build on it.", tag:"Rutherford County sits on karst. We log the evidence — TDEC well voids, USGS sinkholes — and hold every concern to a public, accountable timeline."},
    {eyebrow:"Transparency by design", title:"Nothing edited away. Everything on the record.", tag:"Each issue advances in the open — every status change carries its date, its note, and who acted. That is what accountability looks like."}
  ],
  es:[
    {eyebrow:"Un registro público para nuestra comunidad", title:"Verlo. Registrarlo. Rastrearlo hasta resolverlo.", tag:"Un registro independiente y transparente de los problemas de la comunidad en el Condado de Rutherford — reportados por residentes y seguidos públicamente desde que se reconocen hasta que se resuelven."},
    {eyebrow:"Antes de construir de nuevo", title:"Probar el suelo antes de construir sobre él.", tag:"El Condado de Rutherford está sobre karst. Registramos la evidencia — vacíos en pozos TDEC, sumideros USGS — y sometemos cada caso a una línea de tiempo pública y responsable."},
    {eyebrow:"Transparencia por diseño", title:"Nada se borra. Todo queda en el registro.", tag:"Cada caso avanza a la vista — cada cambio de estado lleva su fecha, su nota y quién actuó. Así se ve la rendición de cuentas."}
  ]
};
let heroIdx = 0;
function applyHeroLang(){ const h=HERO[currentLang][heroIdx]; $('[data-hero="eyebrow"]').textContent=h.eyebrow; $('[data-hero="title"]').textContent=h.title; $('[data-hero="tag"]').textContent=h.tag; }
async function renderHeroStats(){ const m=await API.metrics(); animateTo("#h-logged", m.logged); animateTo("#h-resolved", m.resolved); }

/* =========================================================================
   Populate selects
   ========================================================================= */
function populateSelects(){
  const catOpts = CATEGORIES.map(c=>`<option value="${c}">${catLabel(c)}</option>`).join("");
  $("#r-cat").innerHTML = catOpts;
  $("#f-cat").innerHTML = `<option value="all">${currentLang==="es"?"Todas":"All categories"}</option>`+catOpts;
  const statusOpts = [["all",currentLang==="es"?"Todos":"All statuses"],["st-open",currentLang==="es"?"Abierto":"Open"],["st-prog",currentLang==="es"?"En progreso":"In progress"],["st-done",currentLang==="es"?"Resuelto":"Resolved"],["st-closed",currentLang==="es"?"Cerrado":"Closed"]];
  $("#f-status").innerHTML = statusOpts.map(([v,l])=>`<option value="${v}">${l}</option>`).join("");
}

/* =========================================================================
   Toast
   ========================================================================= */
let toastTimer;
function toast(msg){ const el=$("#toast"); el.textContent=msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove("show"),2600); }

/* =========================================================================
   Wire-up
   ========================================================================= */
document.addEventListener("DOMContentLoaded",()=>{
  cacheEnglish();
  $("#year").textContent = new Date().getFullYear();
  populateSelects();
  $("#tmpl").value = TEMPLATE.en;
  renderCarousel(); renderLog(); renderCounters(); renderHeroStats(); renderMeetings(); renderUpdates(); renderShare();
  initMainMap();
  initTurnstile();

  // open dialogs
  document.body.addEventListener("click", e=>{
    const openBtn = e.target.closest("[data-open]");
    if(openBtn){ e.preventDefault(); const which=openBtn.dataset.open;
      if(which==="report"){ resetReport(); showDialog("#dlg-report"); }
      if(which==="track"){ $("#trackErr").hidden=true; $("#trackId").value=""; showDialog("#dlg-track"); }
    }
    const card = e.target.closest("[data-issue]");
    if(card){ e.preventDefault(); openDetail(card.dataset.issue); }
    if(e.target.closest("[data-close]")) closeDialogs();
  });
  // close on backdrop click
  $$("dialog").forEach(d=> d.addEventListener("click", e=>{ if(e.target===d) closeDialogs(); }));

  // report navigation
  $$("[data-next]").forEach(b=>b.addEventListener("click",()=>{
    const n=+b.dataset.next;
    if(n===2){ const title=$("#r-title").value.trim(), desc=$("#r-desc").value.trim();
      if(!title||!desc){ toast(t("toast.reqfields")||"Please complete the required fields."); return; } }
    gotoStep(n);
  }));
  $$("[data-back]").forEach(b=>b.addEventListener("click",()=>gotoStep(+b.dataset.back)));
  $("#submitReport").addEventListener("click", submitReport);

  // track by id
  $("#trackBtn").addEventListener("click", async ()=>{
    const id=$("#trackId").value.trim(); const i=await API.get(id);
    if(i){ closeDialogs(); openDetail(i.id); } else $("#trackErr").hidden=false;
  });
  $("#trackId").addEventListener("keydown",e=>{ if(e.key==="Enter") $("#trackBtn").click(); });

  // filters
  ["f-cat","f-status","f-sort","f-q"].forEach(id=>{
    $("#"+id).addEventListener(id==="f-q"?"input":"change", renderLog);
  });

  // template actions
  $("#copyTmpl").addEventListener("click", async ()=>{
    try{ await navigator.clipboard.writeText($("#tmpl").value); }catch(e){ $("#tmpl").select(); document.execCommand&&document.execCommand("copy"); }
    toast(t("toast.copied")||"Message copied to clipboard");
  });
  $("#resetTmpl").addEventListener("click", ()=>{ $("#tmpl").value=TEMPLATE[currentLang]; toast(t("toast.reset")||"Template reset"); });

  // forms (demo — no persistence)
  $("#subForm").addEventListener("submit", async e=>{ e.preventDefault(); const email=$("#subEmail").value.trim();
    if(LIVE){ try{ await postJSON('/api/subscribe',{email,kind:'updates'}); }catch(err){ toast(err.message||"Could not subscribe"); return; } }
    e.target.reset(); toast(t("toast.sub")||"Subscribed! Check your email to confirm."); });
  $("#remindForm").addEventListener("submit", async e=>{ e.preventDefault(); const email=$("#remEmail").value.trim();
    if(LIVE){ try{ await postJSON('/api/subscribe',{email,kind:'reminders'}); }catch(err){ toast(err.message||"Could not sign up"); return; } }
    e.target.reset(); toast(t("toast.remind")||"Done! We'll remind you before key dates."); });

  // language
  $$('[data-lang]').forEach(b=>b.addEventListener("click",()=>{ applyLang(b.dataset.lang); if(b.dataset.lang==="es") toast(I18N.es["toast.langset"]); }));

  // mobile menu
  const mb=$(".menu-btn"), nav=$("#navlinks");
  mb.addEventListener("click",()=>{ const open=nav.classList.toggle("open"); mb.setAttribute("aria-expanded",String(open)); });
  nav.addEventListener("click",e=>{ if(e.target.tagName==="A"){ nav.classList.remove("open"); mb.setAttribute("aria-expanded","false"); } });

  // hero rotator
  initHero();

  // deep link (#CS-...)
  if(location.hash.length>1){ const id=decodeURIComponent(location.hash.slice(1)); API.get(id).then(i=>{ if(i) openDetail(i.id); }); }
});

function initHero(){
  const dots=$$(".hero__dots button"); const count=HERO.en.length;
  function show(n){ heroIdx=n; applyHeroLang();
    dots.forEach((d,i)=>d.setAttribute("aria-pressed",String(i===n))); }
  dots.forEach((d,i)=>d.addEventListener("click",()=>show(i)));
  show(0);
  if(!matchMedia("(prefers-reduced-motion:reduce)").matches){
    setInterval(()=>show((heroIdx+1)%count), 7000);
  }
}

/* Expose for inline popup links */
window.openDetail = openDetail;

/* =========================================================================
   HOW TO EXTEND — swapping the seed data for a real backend
   -------------------------------------------------------------------------
   1. DATA LAYER: The `API` object is the only place that touches data.
      Replace each method body with a fetch() to your server, keeping the
      signatures identical:
        list()      -> GET  /api/issues
        get(id)     -> GET  /api/issues/:id
        create(obj) -> POST /api/issues        (server assigns id + created_at)
        metrics()   -> GET  /api/metrics       (or compute client-side from list())
      Nothing else in this file needs to change — renderCarousel/renderLog/
      renderCounters/openDetail already `await` the API.

   2. LIFECYCLE UPDATES (admin): add API.advance(id, {stage, note, actor}) ->
      POST /api/issues/:id/transitions. The server should APPEND to
      stage_history (never edit/delete), set `stage`, and on "Resolved" set
      resolution_summary + resolved_at. The public timeline renders straight
      from stage_history, so it stays append-only by construction.

   3. SUGGESTED SCHEMA (Postgres):
        issues(id, category, title, description, lat, lng, address,
               reporter_contact, created_at, stage, assigned_to,
               resolution_summary, resolved_at)
        issue_events(id, issue_id FK, stage, ts, note, actor)   -- the trail
        issue_photos(id, issue_id FK, url)
        issue_sources(id, issue_id FK, label, url)
      Reference layers (WELLS, SINKS, BOUNDS) can move to GeoJSON endpoints.

   4. TOMBSTONE DATA MODEL: this schema is the master-prompt's safe default.
      When the Tombstone Project's exact fields are supplied, extend the
      issue + issue_events tables and the create()/advance() payloads to match,
      then bump the master prompt to v1.1. The append-only stage_history is
      already the "transparent status trail" the Tombstone model calls for.

   5. HARDENING for real submissions: add a hCaptcha/Turnstile check to
      create(), a moderation flag (`published` boolean) so staff approve
      before public display, auth (e.g. Supabase Auth) on advance(), and
      object storage (S3/Supabase Storage) for photos.
   ========================================================================= */
