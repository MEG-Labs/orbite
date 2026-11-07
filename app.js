import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY, FUSEAU } from './config.js';
import { installerModules } from './modules.js';
import { installerExtras } from './extras.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ================= Constantes ================= */
const STATUTS = ['À traiter', 'À faire', 'En cours', 'En attente', 'Bloqué', 'Terminé', 'Annulé'];
const OUVERTS = ['À traiter', 'À faire', 'En cours', 'En attente', 'Bloqué'];
const TYPES = ['Tâche', 'Événement', 'Jalon', 'Rappel'];
const PRIOS = { 1: '1 — Critique', 2: '2 — Haute', 3: '3 — Normale', 4: '4 — Basse' };
const STATUTS_PROJET = ['À envisager', 'À planifier', 'Actif', 'En pause', 'Terminé', 'Annulé'];
const CONTEXTES = ['Maison', 'Bureau', 'Téléphone', 'Ordinateur', 'Courses', 'Partout'];

const S = { session: null, actions: [], projets: [], domaines: [], personnes: [], vue: 'accueil', filtres: {}, agendaPasses: false,
  vehicules: [], entretiens: [], interventions: [], intEnt: [], livres: [], achats: [], abonnements: [], trajets: [], routines: [], notes: [], budget: [],
  unites: [], postes: [], titulaires: [], participations: [], reglages: [], push: [], file: [], horsLigne: null };
let M, X; // modules, installés après la définition des fonctions communes

const MODULES = [
  { k: 'accueil', l: 'Accueil', g: 'Pilotage', principal: true },
  { k: 'agenda', l: 'Agenda', g: 'Pilotage', principal: true },
  { k: 'projets', l: 'Projets', g: 'Pilotage', principal: true },
  { k: 'actions', l: 'Actions', g: 'Pilotage', principal: true },
  { k: 'delegations', l: 'Délégations', g: 'Pilotage' },
  { k: 'revue', l: 'Revue hebdo', g: 'Pilotage' },
  { k: 'transports', l: 'Transports', g: 'Vie' },
  { k: 'vehicules', l: 'Véhicules', g: 'Vie' },
  { k: 'achats', l: 'Achats', g: 'Vie' },
  { k: 'abonnements', l: 'Abonnements', g: 'Vie' },
  { k: 'bibliotheque', l: 'Bibliothèque', g: 'Vie' },
  { k: 'routines', l: 'Routines', g: 'Vie' },
  { k: 'carnet', l: 'Carnet', g: 'Repères' },
  { k: 'organigramme', l: 'Organigramme', g: 'Repères' },
  { k: 'reperes', l: 'Personnes et domaines', g: 'Repères' },
  { k: 'reglages', l: 'Réglages', g: 'Repères' },
];

/* ================= Utilitaires ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ouvert = a => OUVERTS.includes(a.statut);
const parId = (liste, id) => liste.find(x => x.id === id);

const fmtJour = new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, weekday: 'short', day: 'numeric', month: 'short' });
const fmtJourLong = new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, weekday: 'long', day: 'numeric', month: 'long' });
const fmtHeure = new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false });
const fmtCle = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });

const cleJour = d => fmtCle.format(d instanceof Date ? d : new Date(d)); // AAAA-MM-JJ dans le fuseau
const aujourdhui = () => cleJour(new Date());
const plusJours = (cle, n) => { const d = new Date(cle + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const jourDate = cle => fmtJour.format(new Date(cle + 'T12:00:00'));
const jourLong = cle => fmtJourLong.format(new Date(cle + 'T12:00:00'));

function quand(a, heureSeule = false) {
  if (!a.planifie_debut) return '';
  if (heureSeule) return a.journee_entiere ? 'Journée' : `${fmtHeure.format(new Date(a.planifie_debut))}${a.planifie_fin && !a.journee_entiere ? ' – ' + fmtHeure.format(new Date(a.planifie_fin)) : ''}`;
  const j = cleJour(a.planifie_debut);
  const lbl = j === aujourdhui() ? 'Auj.' : j === plusJours(aujourdhui(), 1) ? 'Demain' : jourDate(j);
  if (a.journee_entiere) return lbl;
  const h = fmtHeure.format(new Date(a.planifie_debut));
  return `${lbl} ${h}`;
}
function enRetard(a) { return ouvert(a) && a.echeance && a.echeance < aujourdhui(); }
function evtPasse(a) {
  if (a.type !== 'Événement' || !ouvert(a) || !a.planifie_debut) return false;
  const fin = a.planifie_fin || a.planifie_debut;
  return a.journee_entiere ? cleJour(fin) < aujourdhui() : new Date(fin) < new Date();
}
function manquants(a) {
  if (!ouvert(a) || a.type === 'Événement') return [];
  const m = [];
  if (!a.type) m.push('type');
  if (!a.domaine_id) m.push('domaine');
  if (!a.projet_id && !a.hors_projet) m.push('projet ou hors projet');
  if (a.dans_perimetre === false && !a.delegue_a_id) m.push('délégué à');
  return m;
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('visible');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('visible'), 2200);
}

const ICONES = {
  accueil: '<path d="M3 11 12 4l9 7v9H3z" fill="none" stroke="currentColor" stroke-width="2"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2"/>',
  projets: '<path d="M3 7h7l2 2h9v11H3z" fill="none" stroke="currentColor" stroke-width="2"/>',
  actions: '<path d="M4 6h2M4 12h2M4 18h2M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="2"/>',
  reperes: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/>',
  plus: '<path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.5"/>',
  revue: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" fill="none" stroke="currentColor" stroke-width="2"/>',
  transports: '<path d="M4 16V9l2-4h12l2 4v7M4 16h16M7 19v-3M17 19v-3M4 11h16" fill="none" stroke="currentColor" stroke-width="2"/>',
  vehicules: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/><path d="M12 4v5M5 15l4.5-2M19 15l-4.5-2" stroke="currentColor" stroke-width="2"/>',
  achats: '<path d="M3 4h3l2 11h11l2-8H7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="19.5" r="1.5" fill="currentColor"/><circle cx="17" cy="19.5" r="1.5" fill="currentColor"/>',
  abonnements: '<rect x="3" y="6" width="18" height="13" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M7 15h4" stroke="currentColor" stroke-width="2"/>',
  bibliotheque: '<path d="M5 4h4v16H5zM10 4h4v16h-4zM15.5 5l3.8-1 3 15.5-3.8 1z" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  routines: '<path d="M12 21c-5-3-8-6-8-10a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 4-3 7-8 10z" fill="none" stroke="currentColor" stroke-width="2"/>',
  carnet: '<path d="M6 3h11v18H6zM9 7h5M9 11h5M3 6h3M3 10h3M3 14h3" fill="none" stroke="currentColor" stroke-width="2"/>',
  organigramme: '<rect x="9" y="3" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="3" y="16" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="15" y="16" width="6" height="5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 8v4M6 16v-4h12v4" fill="none" stroke="currentColor" stroke-width="2"/>',
  delegations: '<circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M14 9h7M18 6l3 3-3 3" fill="none" stroke="currentColor" stroke-width="2"/>',
  reglages: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2"/>',
  moins: '<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/>',
};
const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[n]}</svg>`;
const LOGO = `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="32" rx="25" ry="10" fill="none" stroke="#F26B21" stroke-width="3" transform="rotate(-28 32 32)"/><circle cx="32" cy="32" r="9" fill="#E6EDF2"/><circle cx="53" cy="21" r="4" fill="#F26B21"/></svg>`;

/* ================= Données ================= */
async function charger() {
  const tables = {
    actions: sb.from('actions').select('*').order('cree_le'),
    projets: sb.from('projets_suivi').select('*').order('titre'),
    domaines: sb.from('domaines').select('*').order('ordre'),
    personnes: sb.from('personnes').select('*').order('nom'),
    vehicules: sb.from('vehicules').select('*').order('nom'),
    entretiens: sb.from('entretiens').select('*').order('entretien'),
    interventions: sb.from('interventions').select('*'),
    intEnt: sb.from('interventions_entretiens').select('*'),
    livres: sb.from('livres').select('*').order('titre'),
    achats: sb.from('achats').select('*'),
    abonnements: sb.from('abonnements').select('*').order('nom'),
    trajets: sb.from('trajets').select('*').order('date_heure'),
    routines: sb.from('routines').select('*'),
    notes: sb.from('notes').select('*'),
    budget: sb.from('budget_lignes').select('*'),
    unites: sb.from('unites').select('*').order('nom'),
    postes: sb.from('postes').select('*'),
    titulaires: sb.from('postes_titulaires').select('*'),
    participations: sb.from('participations').select('*'),
    reglages: sb.from('reglages').select('*'),
    push: sb.from('push_abonnements').select('id,appareil,cree_le'),
  };
  const cles = Object.keys(tables);
  let res;
  try {
    res = await Promise.all(Object.values(tables));
    const err = res.find(r => r.error)?.error;
    if (err) throw err;
  } catch (e) {
    // Hors ligne : on retombe sur la dernière copie locale.
    const reseau = !navigator.onLine || /fetch|network|load failed/i.test(e.message || '');
    let copie = null; try { copie = JSON.parse(localStorage.getItem('orbite-cache') || 'null'); } catch { }
    if (reseau && copie) { Object.assign(S, copie.donnees); S.horsLigne = copie.le; return; }
    throw e;
  }
  cles.forEach((k, i) => { S[k] = res[i].data; });
  S.horsLigne = null;
  // Événements passés : terminés automatiquement (aussi fait côté serveur aux 15 minutes).
  const maintenant = new Date(), auj = cleJour(maintenant);
  const passes = S.actions.filter(a => a.type === 'Événement' && !['Terminé', 'Annulé'].includes(a.statut) && (
    !a.planifie_debut ? a.echeance && a.echeance < auj
      : a.journee_entiere ? cleJour(a.planifie_fin || a.planifie_debut) < auj
      : new Date(a.planifie_fin || a.planifie_debut) < maintenant));
  if (passes.length) {
    const { error } = await sb.from('actions').update({ statut: 'Terminé' }).in('id', passes.map(a => a.id));
    if (!error) passes.forEach(a => { a.statut = 'Terminé'; });
  }
  try { localStorage.setItem('orbite-cache', JSON.stringify({ le: new Date().toISOString(), donnees: Object.fromEntries(cles.map(k => [k, S[k]])) })); } catch { }
}
async function rafraichir() { await charger(); rendre(); }

async function majAction(id, champs) {
  const { error } = await sb.from('actions').update(champs).eq('id', id);
  if (error) { toast('Échec : ' + error.message); return false; }
  return true;
}

/* ================= Rendu principal ================= */
function rendre() {
  const app = $('#app');
  if (!S.session) return rendreConnexion(app);
  const courant = S.vue === 'projet' ? 'projets' : S.vue;
  const estPrincipal = MODULES.find(m => m.k === courant)?.principal;
  let groupe = '';
  const navHtml = MODULES.map(m => {
    const tete = m.g !== groupe ? `<div class="groupe-nav">${esc(m.g)}</div>` : ''; groupe = m.g;
    return `${tete}<button data-vue="${m.k}" class="${m.principal ? '' : 'secondaire'}" ${courant === m.k ? 'aria-current="page"' : ''}>${ico(m.k)}<span>${m.l}</span></button>`;
  }).join('') + `<button data-vue="plus" class="seulement-mobile" ${!estPrincipal ? 'aria-current="page"' : ''}>${ico('moins')}<span>Plus</span></button>`;
  app.innerHTML = `
    <header class="bandeau">
      <div class="marque">${LOGO}ORBITE</div>
      <div class="devise">Processus de soutien. Projets logistiques. Le reste, <u>je délègue</u>.</div>
      <div class="horloge" id="horloge"></div>
    </header>
    <div class="coquille">
      <nav class="nav" aria-label="Sections">
        ${navHtml}
        <div class="compte">${esc(S.session.user.email)}<br><button class="btn discret" id="deco" style="padding:4px 0">Se déconnecter</button></div>
      </nav>
      <main id="vue">${S.horsLigne ? `<div class="bandeau-horsligne">Hors ligne · données du ${esc(fmtJour.format(new Date(S.horsLigne)))} à ${esc(fmtHeure.format(new Date(S.horsLigne)))}. Tes captures seront envoyées au retour du réseau.</div>` : ''}</main>
    </div>
    <button class="fab" id="fab" aria-label="Capture rapide" title="Capture rapide (N)">${ico('plus')}</button>`;
  app.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { S.vue = b.dataset.vue; S.filtres = {}; history.replaceState(null, '', S.vue === 'accueil' ? location.pathname : '#' + S.vue); rendre(); window.scrollTo(0, 0); });
  $('#fab').onclick = () => ouvrirCapture();
  $('#deco').onclick = async () => { await sb.auth.signOut(); };
  horloge();
  const v = document.createElement('div'); $('#vue').appendChild(v);
  ({ accueil: vueAccueil, agenda: vueAgenda, projets: vueProjets, projet: vueProjet, actions: vueActions, reperes: vueReperes, ...M.vues, ...X.vues }[S.vue] || vueAccueil)(v);
  brancherLignes(v);
}

function horloge() {
  const el = $('#horloge'); if (!el) return;
  const n = new Date();
  const m = METEO.donnees;
  const temp = m ? `<span class="meteo" title="${esc(`${m.lieu} · ${CIEL[m.code] || ''} · ressenti ${Math.round(m.ressenti)}° · ${fmtHeure.format(new Date(m.le))}`)}">${Math.round(m.t)}°</span>` : '';
  el.innerHTML = `${fmtHeure.format(n)}${temp}<small>${fmtJourLong.format(n)}</small>`;
  const t = el.querySelector('.meteo'); if (t) t.onclick = () => toast(t.title);
}
setInterval(horloge, 15000);

/* ---------- Météo du bandeau (Open-Meteo, sans clé) ---------- */
const CIEL = { 0: 'Dégagé', 1: 'Peu nuageux', 2: 'Partiellement nuageux', 3: 'Couvert', 45: 'Brouillard', 48: 'Brouillard givrant', 51: 'Bruine', 53: 'Bruine', 55: 'Bruine forte',
  56: 'Bruine verglaçante', 57: 'Bruine verglaçante', 61: 'Pluie faible', 63: 'Pluie', 65: 'Pluie forte', 66: 'Pluie verglaçante', 67: 'Pluie verglaçante',
  71: 'Neige faible', 73: 'Neige', 75: 'Neige forte', 77: 'Grésil', 80: 'Averses', 81: 'Averses', 82: 'Averses fortes', 85: 'Averses de neige', 86: 'Averses de neige fortes',
  95: 'Orage', 96: 'Orage et grêle', 99: 'Orage et grêle' };
const METEO = { donnees: null };
try { METEO.donnees = JSON.parse(localStorage.getItem('orbite-meteo') || 'null'); } catch { }
const QUEBEC = { lat: 46.81, lon: -71.21 };
function position() {
  return new Promise(ok => {
    if (!navigator.geolocation) return ok(null);
    // Le délai du navigateur ne court qu'après l'autorisation : on n'attend pas plus de 10 s une réponse à la demande.
    setTimeout(() => ok(null), 10e3);
    navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), () => ok(null),
      { enableHighAccuracy: false, maximumAge: 30 * 60e3, timeout: 15e3 });
  });
}
async function majMeteo() {
  if (!navigator.onLine) return;
  const ici = await position();
  const pos = ici || (METEO.donnees?.lat != null ? METEO.donnees : QUEBEC);
  // Coordonnées arrondies (environ 1 km) : assez pour la météo, sans transmettre l'adresse exacte.
  const lat = (+pos.lat).toFixed(2), lon = (+pos.lon).toFixed(2);
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,weather_code&timezone=America%2FToronto`);
    if (!r.ok) return;
    const c = (await r.json()).current;
    METEO.donnees = { t: c.temperature_2m, ressenti: c.apparent_temperature, code: c.weather_code, le: new Date().toISOString(), lat, lon,
      lieu: ici ? 'Ta position' : METEO.donnees?.lieu === 'Ta position' ? 'Dernière position connue' : 'Québec (position non autorisée)' };
    try { localStorage.setItem('orbite-meteo', JSON.stringify(METEO.donnees)); } catch { }
    horloge();
  } catch { }
}
setInterval(majMeteo, 20 * 60e3);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!METEO.donnees || Date.now() - new Date(METEO.donnees.le) > 20 * 60e3)) majMeteo();
});

/* ---------- Ligne d'action réutilisable ---------- */
// Calendrier d'origine d'un événement importé (nom et couleur réglés dans Réglages › Calendriers importés).
const COULEURS_CAL = [['Rose', '#E86AA6'], ['Bleu', '#4C9BE8'], ['Vert', '#4FB286'], ['Violet', '#9B7BE0'], ['Jaune', '#E8B23A'], ['Turquoise', '#3BC1C1'], ['Gris', '#8FA8B8']];
function calendrierDe(a) {
  if (!a.uid_externe) return null;
  const cals = S.reglages.find(r => r.cle === 'calendriers_ics')?.valeur || [];
  const i = cals.findIndex(c => c.id === a.uid_externe.split('|')[0]);
  const c = cals[i];
  return { nom: c?.nom || a.source_externe || 'Calendrier', couleur: c?.couleur || COULEURS_CAL[Math.max(i, 0) % COULEURS_CAL.length][1] };
}
function ligne(a, { montrerProjet = true, heureSeule = false } = {}) {
  const p = parId(S.projets, a.projet_id);
  const ferme = !ouvert(a);
  const evt = a.type === 'Événement';
  const meta = [];
  if (a.statut !== 'À faire' && !evt) meta.push(`<span class="pastille st-${esc(a.statut)}">${esc(a.statut)}</span>`);
  if (a.priorite && a.priorite <= 2) meta.push(`<span class="pastille prio-${a.priorite}">P${a.priorite}</span>`);
  if (montrerProjet && p) meta.push(`<span>${esc(p.titre)}</span>`);
  if (a.echeance) meta.push(`<span class="${enRetard(a) ? 'retard' : ''}">Échéance ${esc(jourDate(a.echeance))}${enRetard(a) ? ' · en retard' : ''}</span>`);
  if (a.relance) meta.push(`<span>Relance ${esc(jourDate(a.relance))}</span>`);
  const deleg = parId(S.personnes, a.delegue_a_id); if (deleg) meta.push(`<span>Délégué à ${esc(deleg.nom)}</span>`);
  const att = parId(S.personnes, a.en_attente_de_id); if (att) meta.push(`<span>Attend ${esc(att.nom)}</span>`);
  if (a.motif_blocage) meta.push(`<span>${esc(a.motif_blocage)}</span>`);
  if (a.reference_externe && /^[A-Z][A-Z0-9]+-\d+$/.test(a.reference_externe.trim())) {
    const dom = S.reglages.find(r => r.cle === 'jira_domaine')?.valeur || 'canac.atlassian.net';
    meta.push(`<a class="lien-jira" href="https://${esc(dom)}/browse/${esc(a.reference_externe.trim())}" target="_blank" rel="noopener">${esc(a.reference_externe.trim())}${a.statut_jira ? ' · ' + esc(a.statut_jira) : ''}</a>`);
  }
  const cal = calendrierDe(a);
  if (cal) meta.push(`<span class="pastille pastille-cal" style="--cal:${esc(cal.couleur)}">${esc(cal.nom)}</span>`);
  const m = manquants(a);
  return `<li class="ligne ${ferme ? 'ferme' : ''}" data-id="${a.id}">
    ${evt ? `<span class="puce-evt" aria-hidden="true"${cal ? ` style="background:${esc(cal.couleur)}"` : ''}></span>` : `<button class="coche ${a.statut === 'Terminé' ? 'fait' : ''}" data-coche="${a.id}" aria-label="${a.statut === 'Terminé' ? 'Rouvrir' : 'Marquer terminé'} : ${esc(a.titre)}"></button>`}
    <div>
      <div class="titre">${esc(a.titre)}${m.length ? `<span class="incomplet" title="À compléter : ${esc(m.join(', '))}"></span>` : ''}</div>
      ${meta.length ? `<div class="meta">${meta.join('')}</div>` : ''}
      ${a.prochain_geste && ouvert(a) ? `<div class="geste">▸ ${esc(a.prochain_geste)}</div>` : ''}
    </div>
    <div class="droite">${esc(quand(a, heureSeule))}</div>
  </li>`;
}
function liste(items, vide, opts) {
  return items.length ? `<ul class="lignes">${items.map(a => ligne(a, opts)).join('')}</ul>` : `<div class="vide">${vide}</div>`;
}
function brancherLignes(racine) {
  racine.querySelectorAll('[data-coche]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const a = parId(S.actions, b.dataset.coche);
    const nouveau = a.statut === 'Terminé' ? 'À faire' : 'Terminé';
    if (await majAction(a.id, { statut: nouveau, realisee_le: nouveau === 'Terminé' ? new Date().toISOString() : null })) {
      toast(nouveau === 'Terminé' ? 'Terminé' : 'Rouvert'); rafraichir();
    }
  });
  racine.querySelectorAll('.ligne[data-id]').forEach(l => l.onclick = () => ouvrirAction(parId(S.actions, l.dataset.id)));
  racine.querySelectorAll('a.lien-jira').forEach(a => a.onclick = e => e.stopPropagation());
  racine.querySelectorAll('[data-projet]').forEach(el => {
    const go = () => { S.vue = 'projet'; S.projetId = el.dataset.projet; rendre(); window.scrollTo(0, 0); };
    el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

const triOuvert = (a, b) => (a.priorite ?? 3) - (b.priorite ?? 3) || (a.echeance || '9999').localeCompare(b.echeance || '9999') || a.cree_le.localeCompare(b.cree_le);
const triDate = (a, b) => (a.planifie_debut || '').localeCompare(b.planifie_debut || '');

/* ---------- Accueil ---------- */
function vueAccueil(v) {
  const auj = aujourdhui(), dans7 = plusJours(auj, 7);
  const taches = S.actions.filter(a => a.type !== 'Événement');
  const enCours = taches.filter(a => a.statut === 'En cours').sort(triOuvert);
  const backlog = taches.filter(a => ['À faire', 'À traiter'].includes(a.statut)).sort(triOuvert);
  const bloques = S.actions.filter(a => ['Bloqué', 'En attente'].includes(a.statut) || (ouvert(a) && a.relance && a.relance <= auj));
  const retards = S.actions.filter(enRetard);
  const aTrier = S.actions.filter(a => a.statut === 'À traiter');
  const passes = S.actions.filter(evtPasse);
  const aVenir = S.actions.filter(a => ouvert(a) && a.planifie_debut && !evtPasse(a) && cleJour(a.planifie_debut) <= dans7).sort(triDate);
  const evenements = aVenir.filter(a => a.type === 'Événement');
  const semaine = aVenir.filter(a => a.type !== 'Événement');
  const demain = plusJours(auj, 1);
  const joursEvt = [...new Set(evenements.map(a => cleJour(a.planifie_debut) < auj ? auj : cleJour(a.planifie_debut)))];
  const libJour = j => j === auj ? 'Aujourd’hui' : j === demain ? 'Demain' : jourLong(j);
  const actifs = S.projets.filter(p => p.statut === 'Actif');
  const aCompleter = S.actions.filter(a => manquants(a).length);

  const cpt = (n, lbl, cls, cible) => `<button class="compteur ${n ? cls : 'calme'}" data-cible="${cible}"><b>${n}</b><span>${lbl}</span></button>`;
  v.innerHTML = `
    <section class="bloc bloc-evenements"><header><h2>Événements <span class="nb">${evenements.length}</span></h2><button class="btn discret" data-aller="agenda">Agenda</button></header>
      ${joursEvt.length ? joursEvt.map(j => `<div class="jour-evt ${j === auj ? 'aujourdhui' : ''}"><h3>${esc(libJour(j))}</h3>${liste(evenements.filter(a => (cleJour(a.planifie_debut) < auj ? auj : cleJour(a.planifie_debut)) === j), '', { heureSeule: true })}</div>`).join('')
        : '<div class="vide">Aucun événement dans les 7 prochains jours.</div>'}</section>
    <section class="compteurs" aria-label="Indicateurs">
      ${cpt(enCours.length, 'En cours', 'calme', 'en-cours')}
      ${cpt(taches.filter(ouvert).length, 'Tâches ouvertes', 'calme', 'ouvertes')}
      ${cpt(retards.length, 'En retard', 'alerte', 'retard')}
      ${cpt(bloques.length, 'Bloquées ou relances', 'attention', 'bloques')}
      ${cpt(aTrier.length, 'À trier', 'attention', 'trier')}
      ${cpt(actifs.length, 'Projets actifs', 'calme', 'projets')}
    </section>
    ${passes.length ? `<div class="bloc signal" style="margin-bottom:22px"><header><h2>${passes.length} événement${passes.length > 1 ? 's' : ''} passé${passes.length > 1 ? 's' : ''} encore ouvert${passes.length > 1 ? 's' : ''}</h2>
      <div style="display:flex;gap:8px"><button class="btn discret" id="voirPasses">Voir</button><button class="btn" id="fermerPasses">Marquer terminés</button></div></header></div>` : ''}
    <div class="grille">
      <div class="colonne">
        ${X.blocPlan()}
        <section class="bloc"><header><h2>En cours <span class="nb">${enCours.length}</span></h2></header>
          ${liste(enCours, 'Rien en cours. Passe une tâche du backlog à « En cours » pour la retrouver ici.')}</section>
        <section class="bloc"><header><h2>Backlog et engagements <span class="nb">${backlog.length}</span></h2></header>
          ${liste(backlog, 'Backlog vide.')}</section>
      </div>
      <div class="colonne">
        ${M.encartsAccueil()}
        <section class="bloc"><header><h2>Tâches planifiées · 7 jours <span class="nb">${semaine.length}</span></h2><button class="btn discret" data-aller="agenda">Agenda</button></header>
          ${liste(semaine, 'Aucune tâche planifiée cette semaine.')}</section>
        ${bloques.length ? `<section class="bloc"><header><h2>Blocages et relances <span class="nb">${bloques.length}</span></h2></header>${liste(bloques, '')}</section>` : ''}
        <section class="bloc"><header><h2>Projets en mouvement <span class="nb">${actifs.length}</span></h2><button class="btn discret" data-aller="projets">Tous</button></header>
          ${actifs.map(carteProjet).join('') || '<div class="vide">Aucun projet actif.</div>'}</section>
        ${aCompleter.length ? `<section class="bloc"><header><h2>À compléter <span class="nb">${aCompleter.length}</span></h2></header>${liste(aCompleter.slice(0, 8), '')}</section>` : ''}
      </div>
    </div>`;
  v.querySelectorAll('[data-aller]').forEach(b => b.onclick = () => { S.vue = b.dataset.aller; rendre(); });
  const cp = v.querySelector('#choisirPlan'); if (cp) cp.onclick = () => X.choisirPlan();
  v.querySelectorAll('[data-cible]').forEach(b => b.onclick = () => {
    const c = b.dataset.cible;
    if (c === 'projets') { S.vue = 'projets'; return rendre(); }
    S.vue = 'actions';
    S.filtres = { 'en-cours': { statut: 'En cours' }, ouvertes: { statut: 'ouverts', type: 'Tâche' }, retard: { special: 'retard' }, bloques: { special: 'bloques' }, trier: { statut: 'À traiter' } }[c];
    rendre();
  });
  const vp = $('#voirPasses'); if (vp) vp.onclick = () => { S.vue = 'actions'; S.filtres = { special: 'passes' }; rendre(); };
  const fp = $('#fermerPasses'); if (fp) fp.onclick = async () => {
    fp.disabled = true;
    const { error } = await sb.from('actions').update({ statut: 'Terminé' }).in('id', passes.map(a => a.id));
    if (error) { toast('Échec : ' + error.message); fp.disabled = false; return; }
    toast(`${passes.length} événements marqués terminés`); rafraichir();
  };
}

function sante(p) {
  if (!['Actif', 'En pause'].includes(p.statut)) return 'neutre';
  if (p.nb_retards > 0 || (p.cible && p.cible < aujourdhui())) return 'ko';
  if (p.nb_bloquees > 0 || (p.nb_taches > p.nb_terminees && !p.prochaine_action)) return 'risque';
  if (p.nb_taches === 0) return 'neutre';
  return 'ok';
}
function carteProjet(p) {
  const pct = p.nb_taches ? Math.round(100 * p.nb_terminees / p.nb_taches) : 0;
  const s = sante(p);
  const libSante = { ok: 'En santé', risque: 'À surveiller', ko: 'En retard', neutre: 'Sans tâches' }[s];
  return `<div class="projet" data-projet="${p.id}" role="button" tabindex="0">
    <div class="tete"><span class="nom">${esc(p.titre)}</span><span class="sante ${s}" title="${libSante}" aria-label="${libSante}"></span></div>
    <div class="prochaine">${p.prochaine_action ? '▸ ' + esc(p.prochaine_action) : (p.nb_taches ? 'Aucune prochaine action définie' : 'Aucune tâche liée')}</div>
    <div class="chiffres"><span>${p.nb_terminees}/${p.nb_taches} terminées</span>${p.nb_retards ? `<span class="rouge">${p.nb_retards} en retard</span>` : ''}${p.cible ? `<span>Cible ${esc(jourDate(p.cible))}</span>` : ''}</div>
    <div class="jauge" aria-hidden="true"><i style="width:${pct}%"></i></div>
  </div>`;
}

/* ---------- Agenda ---------- */
function vueAgenda(v) {
  const auj = aujourdhui();
  const debut = S.agendaPasses ? plusJours(auj, -21) : auj;
  const fin = plusJours(auj, 45);
  const items = S.actions.filter(a => a.statut !== 'Annulé' && a.planifie_debut).filter(a => { const j = cleJour(a.planifie_debut); return j >= debut && j <= fin; });
  // échéances sans planification
  const ech = S.actions.filter(a => ouvert(a) && !a.planifie_debut && a.echeance && a.echeance >= debut && a.echeance <= fin);
  const parJour = {};
  items.forEach(a => (parJour[cleJour(a.planifie_debut)] ||= []).push(a));
  ech.forEach(a => (parJour[a.echeance] ||= []).push(a));
  const jours = Object.keys(parJour).sort();
  v.innerHTML = `
    <h1>Agenda</h1><p class="sous-titre">Événements, tâches planifiées et échéances.</p>
    <div class="outils"><div class="onglets">
      <button aria-pressed="${!S.agendaPasses}" data-passes="0">À venir</button>
      <button aria-pressed="${S.agendaPasses}" data-passes="1">Inclure 3 semaines passées</button></div>
      <button class="btn" id="nouvelEvt">Ajouter un événement</button></div>
    ${jours.length ? jours.map(j => `<section class="jour ${j === auj ? 'aujourdhui' : ''}"><h3>${esc(jourLong(j))}${j === auj ? ' · aujourd’hui' : ''}</h3>
      ${liste(parJour[j].sort((x, y) => (x.journee_entiere ? -1 : 0) - (y.journee_entiere ? -1 : 0) || triDate(x, y)), '')}</section>`).join('')
      : '<div class="bloc"><div class="vide">Rien de planifié. Ajoute un événement ou donne une date « Planifié » à une tâche.</div></div>'}`;
  v.querySelectorAll('[data-passes]').forEach(b => b.onclick = () => { S.agendaPasses = b.dataset.passes === '1'; rendre(); });
  $('#nouvelEvt').onclick = () => ouvrirAction({ type: 'Événement', statut: 'À faire' });
}

/* ---------- Projets ---------- */
function vueProjets(v) {
  const f = S.filtres.statutProjet || 'Actif';
  const projets = S.projets.filter(p => f === 'tous' || p.statut === f);
  v.innerHTML = `
    <h1>Projets et objectifs</h1><p class="sous-titre">Avancement, tâches et santé de chaque projet.</p>
    <div class="outils"><div class="onglets">
      ${['Actif', 'À planifier', 'En pause', 'Terminé', 'tous'].map(s => `<button aria-pressed="${f === s}" data-sp="${s}">${s === 'tous' ? 'Tous' : s}</button>`).join('')}
    </div><button class="btn primaire" id="nouveauProjet">Nouveau projet</button></div>
    <div class="cartes-projets">${projets.map(carteProjet).join('') || '<div class="bloc"><div class="vide">Aucun projet dans ce statut.</div></div>'}</div>`;
  v.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { S.filtres.statutProjet = b.dataset.sp; rendre(); });
  $('#nouveauProjet').onclick = () => ouvrirProjet({ statut: 'Actif', nature: 'Projet ponctuel', niveau: 'Projet' });
}

function vueProjet(v) {
  const p = parId(S.projets, S.projetId);
  if (!p) { S.vue = 'projets'; return vueProjets(v); }
  const acts = S.actions.filter(a => a.projet_id === p.id);
  const ouverts = acts.filter(ouvert).sort(triOuvert), fermes = acts.filter(a => !ouvert(a));
  const dom = parId(S.domaines, p.domaine_id), resp = parId(S.personnes, p.responsable_id), parent = parId(S.projets, p.parent_id);
  const enfants = S.projets.filter(x => x.parent_id === p.id);
  const det = [
    ['Statut', p.statut], ['Nature', p.nature], ['Niveau', p.niveau], ['Priorité', PRIOS[p.priorite]],
    ['Début', p.debut && jourDate(p.debut)], ['Cible', p.cible && jourDate(p.cible)], ['Domaine', dom?.nom], ['Responsable', resp?.nom], ['Parent', parent?.titre],
  ].filter(x => x[1]);
  v.innerHTML = `
    <div class="outils"><button class="btn discret" id="retour">‹ Projets</button></div>
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap">
      <div><h1>${esc(p.titre)}</h1><p class="sous-titre">${det.map(([k, val]) => `${k} : ${esc(val)}`).join(' · ')}</p></div>
      <div style="display:flex;gap:8px"><button class="btn" id="modifierProjet">Modifier</button><button class="btn primaire" id="ajoutAction">Ajouter une action</button></div>
    </div>
    <div class="grille">
      <div class="colonne">
        <section class="bloc"><header><h2>Résultat attendu</h2></header><div class="vide" style="color:var(--craie)">${p.resultat_attendu ? esc(p.resultat_attendu) : '<span style="color:var(--brume)">Pas encore défini. Quel changement concret doit être obtenu?</span>'}</div></section>
        <section class="bloc"><header><h2>Actions ouvertes <span class="nb">${ouverts.length}</span></h2></header>${liste(ouverts, 'Aucune action ouverte.', { montrerProjet: false })}</section>
        ${fermes.length ? `<section class="bloc"><header><h2>Terminées et annulées <span class="nb">${fermes.length}</span></h2></header>${liste(fermes, '', { montrerProjet: false })}</section>` : ''}
      </div>
      <div class="colonne">${carteProjet(p).replace('class="projet"', 'class="projet bloc"')}
        ${enfants.length ? `<section class="bloc"><header><h2>Sous-projets</h2></header>${enfants.map(carteProjet).join('')}</section>` : ''}
        ${p.notes ? `<section class="bloc"><header><h2>Notes du projet</h2></header><div class="vide" style="color:var(--craie);white-space:pre-wrap">${esc(p.notes)}</div></section>` : ''}
        ${M.complementsProjet(p)}
      </div>
    </div>`;
  $('#retour').onclick = () => { S.vue = 'projets'; rendre(); };
  $('#modifierProjet').onclick = () => ouvrirProjet(p);
  $('#ajoutAction').onclick = () => ouvrirAction({ type: 'Tâche', statut: 'À faire', projet_id: p.id, domaine_id: p.domaine_id });
  M.brancherProjet(v, p);
}

/* ---------- Toutes les actions ---------- */
function vueActions(v) {
  const f = S.filtres;
  const q = (f.q || '').toLowerCase();
  let items = S.actions.slice();
  if (f.special === 'retard') items = items.filter(enRetard);
  else if (f.special === 'bloques') items = items.filter(a => ['Bloqué', 'En attente'].includes(a.statut) || (ouvert(a) && a.relance && a.relance <= aujourdhui()));
  else if (f.special === 'passes') items = items.filter(evtPasse);
  if (f.statut === 'ouverts') items = items.filter(ouvert);
  else if (f.statut) items = items.filter(a => a.statut === f.statut);
  if (f.type) items = items.filter(a => a.type === f.type);
  if (f.projet) items = items.filter(a => f.projet === 'aucun' ? !a.projet_id : a.projet_id === f.projet);
  if (q) items = items.filter(a => [a.titre, a.prochain_geste, a.notes, a.reference_externe].some(x => (x || '').toLowerCase().includes(q)));
  items.sort((a, b) => (ouvert(b) - ouvert(a)) || (b.planifie_debut || b.cree_le).localeCompare(a.planifie_debut || a.cree_le));
  const titreFiltre = { retard: 'En retard', bloques: 'Bloquées ou relances', passes: 'Événements passés encore ouverts' }[f.special];
  v.innerHTML = `
    <h1>Actions et agenda</h1><p class="sous-titre">${titreFiltre ? esc(titreFiltre) + ' · <button class="btn discret" id="effacer" style="padding:0">effacer le filtre</button>' : 'Tâches, événements, jalons et rappels.'}</p>
    <div class="outils">
      <input type="search" id="q" placeholder="Chercher" value="${esc(f.q || '')}" aria-label="Chercher">
      <select id="fStatut" aria-label="Statut"><option value="">Tous les statuts</option><option value="ouverts" ${f.statut === 'ouverts' ? 'selected' : ''}>Ouverts</option>${STATUTS.map(s => `<option ${f.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="fType" aria-label="Type"><option value="">Tous les types</option>${TYPES.map(s => `<option ${f.type === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="fProjet" aria-label="Projet"><option value="">Tous les projets</option><option value="aucun" ${f.projet === 'aucun' ? 'selected' : ''}>Sans projet</option>${S.projets.map(p => `<option value="${p.id}" ${f.projet === p.id ? 'selected' : ''}>${esc(p.titre)}</option>`).join('')}</select>
    </div>
    <section class="bloc"><header><h2>${items.length} élément${items.length > 1 ? 's' : ''}</h2>
      ${f.special === 'passes' && items.length ? '<button class="btn" id="fermerTout">Marquer terminés</button>' : ''}</header>
      ${liste(items, 'Aucun résultat pour ces filtres.')}</section>`;
  const maj = () => { S.filtres = { ...S.filtres, q: $('#q').value, statut: $('#fStatut').value, type: $('#fType').value, projet: $('#fProjet').value }; const pos = $('#q').selectionStart; rendre(); const qi = $('#q'); if (document.activeElement !== qi && maj.focusQ) { qi.focus(); qi.setSelectionRange(pos, pos); } };
  $('#q').oninput = () => { maj.focusQ = true; clearTimeout(maj.t); maj.t = setTimeout(maj, 180); };
  ['#fStatut', '#fType', '#fProjet'].forEach(s => $(s).onchange = () => { maj.focusQ = false; maj(); });
  const ef = $('#effacer'); if (ef) ef.onclick = () => { S.filtres = {}; rendre(); };
  const ft = $('#fermerTout'); if (ft) ft.onclick = async () => {
    const { error } = await sb.from('actions').update({ statut: 'Terminé' }).in('id', items.map(a => a.id));
    if (error) return toast('Échec : ' + error.message);
    toast(`${items.length} événements marqués terminés`); S.filtres = {}; rafraichir();
  };
}

/* ---------- Repères : domaines et personnes ---------- */
function vueReperes(v) {
  v.innerHTML = `
    <h1>Personnes et domaines</h1><p class="sous-titre">Domaines de vie et personnes auxquelles tu délègues.</p>
    <div class="grille">
      <section class="bloc"><header><h2>Personnes et organisations <span class="nb">${S.personnes.length}</span></h2><button class="btn" id="ajoutPers">Ajouter</button></header>
        <div style="padding:10px 14px"><input type="search" id="qp" placeholder="Chercher une personne" style="width:100%" aria-label="Chercher une personne"></div>
        <table class="tableau" id="tPers"><thead><tr><th>Nom</th><th class="opt">Département</th><th class="opt">Courriel</th><th>Actions</th></tr></thead><tbody></tbody></table></section>
      <section class="bloc"><header><h2>Domaines de vie</h2><button class="btn" id="ajoutDom">Ajouter</button></header>
        <ul class="lignes">${S.domaines.map(d => {
          const n = S.actions.filter(a => a.domaine_id === d.id && ouvert(a)).length;
          return `<li class="ligne" data-dom="${d.id}" style="grid-template-columns:1fr auto"><div><div class="titre">${esc(d.nom)}</div><div class="meta">${esc(d.intention || '')}</div></div><div class="droite">${n} ouverte${n > 1 ? 's' : ''}</div></li>`;
        }).join('')}</ul></section>
    </div>`;
  const dessinerPers = () => {
    const q = ($('#qp').value || '').toLowerCase();
    $('#tPers tbody').innerHTML = S.personnes.filter(p => p.nom.toLowerCase().includes(q)).map(p => {
      const n = S.actions.filter(a => ouvert(a) && (a.delegue_a_id === p.id || a.en_attente_de_id === p.id)).length;
      return `<tr data-pers="${p.id}"><td>${esc(p.nom)}</td><td class="opt">${esc(parId(S.unites, p.departement_id)?.nom || p.fonction || '')}</td><td class="opt">${esc(p.courriel || '')}</td><td>${n || ''}</td></tr>`;
    }).join('');
    v.querySelectorAll('[data-pers]').forEach(r => r.onclick = () => ouvrirPersonne(parId(S.personnes, r.dataset.pers)));
  };
  $('#qp').oninput = dessinerPers; dessinerPers();
  $('#ajoutPers').onclick = () => ouvrirPersonne({ nature: 'Personne', actif: true });
  $('#ajoutDom').onclick = () => ouvrirDomaine({ actif: true });
  v.querySelectorAll('[data-dom]').forEach(r => r.onclick = () => ouvrirDomaine(parId(S.domaines, r.dataset.dom)));
}

/* ================= Formulaires ================= */
const opts = (liste, val, { vide = '—', cle = 'id', lib = 'nom' } = {}) =>
  `<option value="">${vide}</option>` + liste.map(x => `<option value="${esc(x[cle])}" ${x[cle] === val ? 'selected' : ''}>${esc(x[lib])}</option>`).join('');
const optsTexte = (liste, val) => liste.map(s => `<option ${s === val ? 'selected' : ''}>${esc(s)}</option>`).join('');

function versLocal(iso) { // timestamptz -> valeur datetime-local dans le fuseau
  if (!iso) return '';
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
function depuisLocal(val) { // valeur datetime-local (heure de Toronto) -> ISO
  if (!val) return null;
  const naif = new Date(val + ':00Z');
  const vu = new Date(versLocal(naif.toISOString()) + ':00Z');
  return new Date(naif.getTime() - (vu - naif)).toISOString();
}
const minuitLocal = jour => depuisLocal(jour + 'T00:00');

function dialogue(html, onsubmit) {
  const d = document.createElement('dialog');
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.querySelectorAll('[data-fermer]').forEach(b => b.onclick = () => d.close());
  const f = d.querySelector('form');
  f.onsubmit = async e => {
    e.preventDefault();
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try { if (await onsubmit(new FormData(f), d) !== false) d.close(); }
    finally { btn.disabled = false; }
  };
  d.showModal();
  const premier = d.querySelector('[autofocus]'); if (premier) premier.focus();
  return d;
}

/* ---------- Capture rapide ---------- */
function ouvrirCapture() {
  dialogue(`<form>
    <div class="tete-d"><h2>Capture rapide</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
    <div class="corps">
      <label class="champ large"><span>Quoi?</span><input name="titre" class="titre-saisie" required autofocus autocomplete="off" placeholder="Un titre suffit"></label>
      <div class="types-rapides" role="radiogroup" aria-label="Type">${[...TYPES, 'Achat', 'Note'].map((t, i) => `<label><input type="radio" name="type" value="${t}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <label class="champ"><span>Quand (facultatif)</span><input type="datetime-local" name="quand"></label>
      <label class="champ"><span>Projet</span><select name="projet_id">${opts(S.projets.filter(p => p.statut === 'Actif'), null, { vide: 'Aucun pour l’instant', lib: 'titre' })}</select></label>
    </div>
    <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Capturer</button></div>
  </form>`, async fd => {
    const projet = parId(S.projets, fd.get('projet_id'));
    if (fd.get('type') === 'Achat' || fd.get('type') === 'Note') {
      const [table, l] = fd.get('type') === 'Achat'
        ? ['achats', { item: fd.get('titre').trim(), statut: 'À compléter', projet_id: projet?.id || null }]
        : ['notes', { titre: fd.get('titre').trim(), type: 'Note', projet_id: projet?.id || null, domaine_id: projet?.domaine_id || null }];
      if (!navigator.onLine) { X.mettreEnFile(table, l); return; }
      const r = await sb.from(table).insert(l);
      if (r.error) { if (/fetch|network/i.test(r.error.message)) { X.mettreEnFile(table, l); return; } toast('Échec : ' + r.error.message); return false; }
      toast(fd.get('type') === 'Achat' ? 'Ajouté aux achats' : 'Note créée'); return rafraichir();
    }
    const ligne = { titre: fd.get('titre').trim(), type: fd.get('type'), statut: fd.get('type') === 'Événement' ? 'À faire' : 'À traiter',
      planifie_debut: depuisLocal(fd.get('quand')), projet_id: projet?.id || null, domaine_id: projet?.domaine_id || null };
    if (!navigator.onLine) { X.mettreEnFile('actions', ligne); return; }
    const { error } = await sb.from('actions').insert(ligne);
    if (error) { if (/fetch|network/i.test(error.message)) { X.mettreEnFile('actions', ligne); return; } toast('Échec : ' + error.message); return false; }
    toast('Capturé'); rafraichir();
  });
}

/* ---------- Fiche action ---------- */
function ouvrirAction(a) {
  const nouveau = !a.id;
  const jour = a.journee_entiere && a.planifie_debut ? cleJour(a.planifie_debut) : '';
  const m = manquants(a);
  const d = dialogue(`<form>
    <div class="tete-d"><h2>${nouveau ? 'Nouvelle action' : 'Action #' + a.ref}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
    <div class="corps">
      <label class="champ large"><span>Titre</span><input name="titre" class="titre-saisie" required value="${esc(a.titre)}" ${nouveau ? 'autofocus' : ''}></label>
      ${m.length ? `<p class="champ large erreur" style="margin:0">À compléter : ${esc(m.join(', '))}</p>` : ''}
      <label class="champ"><span>Statut</span><select name="statut">${optsTexte(STATUTS, a.statut || 'À faire')}</select></label>
      <label class="champ"><span>Type</span><select name="type">${optsTexte([...TYPES, 'Routine'], a.type || 'Tâche')}</select></label>
      <label class="champ large"><span>Prochain geste</span><input name="prochain_geste" value="${esc(a.prochain_geste)}" placeholder="Une action concrète qui commence par un verbe"></label>

      <fieldset><legend>Dates et priorité</legend>
        <label class="champ case"><input type="checkbox" name="journee_entiere" ${a.journee_entiere ? 'checked' : ''}><span>Journée entière</span></label>
        <label class="champ"><span>Priorité</span><select name="priorite"><option value="">—</option>${Object.entries(PRIOS).map(([k, l]) => `<option value="${k}" ${String(a.priorite) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="champ heure"><span>Planifié — début</span><input type="datetime-local" name="planifie_debut" value="${a.journee_entiere ? '' : versLocal(a.planifie_debut)}"></label>
        <label class="champ heure"><span>Planifié — fin</span><input type="datetime-local" name="planifie_fin" value="${a.journee_entiere ? '' : versLocal(a.planifie_fin)}"></label>
        <label class="champ jourent"><span>Planifié le</span><input type="date" name="jour" value="${jour}"></label>
        <label class="champ"><span>Échéance</span><input type="date" name="echeance" value="${a.echeance || ''}"></label>
        <label class="champ"><span>Relance</span><input type="date" name="relance" value="${a.relance || ''}"></label>
        <label class="champ"><span>Durée prévue (min)</span><input type="number" min="0" step="5" name="duree_min" value="${a.duree_min ?? ''}"></label>
      </fieldset>

      <fieldset><legend>Relier</legend>
        <label class="champ"><span>Projet</span><select name="projet_id">${opts(S.projets, a.projet_id, { lib: 'titre' })}</select></label>
        <label class="champ"><span>Domaine</span><select name="domaine_id">${opts(S.domaines, a.domaine_id)}</select></label>
        <label class="champ case"><input type="checkbox" name="hors_projet" ${a.hors_projet ? 'checked' : ''}><span>Hors projet (volontairement)</span></label>
        <label class="champ"><span>Dans mon périmètre?</span><select name="dans_perimetre"><option value="">—</option><option value="true" ${a.dans_perimetre === true ? 'selected' : ''}>Oui</option><option value="false" ${a.dans_perimetre === false ? 'selected' : ''}>Non, je délègue</option></select></label>
        <label class="champ"><span>Délégué à</span><select name="delegue_a_id">${opts(S.personnes, a.delegue_a_id)}</select></label>
        <label class="champ"><span>En attente de</span><select name="en_attente_de_id">${opts(S.personnes, a.en_attente_de_id)}</select></label>
        <label class="champ large"><span>Motif du blocage</span><input name="motif_blocage" value="${esc(a.motif_blocage)}"></label>
        <div class="champ large"><span>Contexte</span><div class="types-rapides">${CONTEXTES.map(c => `<label><input type="checkbox" name="contexte" value="${c}" ${(a.contexte || []).includes(c) ? 'checked' : ''}><span>${c}</span></label>`).join('')}</div></div>
      </fieldset>

      <fieldset><legend>Détails</legend>
        <label class="champ"><span>Lieu ou lien</span><input name="lieu" value="${esc(a.lieu)}"></label>
        <label class="champ"><span>Référence externe</span><input name="reference_externe" value="${esc(a.reference_externe)}" placeholder="CANAC-123, billet…"></label>
        ${a.lieu && /^https?:\/\//.test(a.lieu) ? `<p class="champ large" style="margin:0"><a href="${esc(a.lieu)}" target="_blank" rel="noopener">Ouvrir le lien</a></p>` : ''}
        <label class="champ large"><span>Notes</span><textarea name="notes">${esc(a.notes)}</textarea></label>
      </fieldset>

      <details class="champ large" ${a.probleme_signale || a.emplacement ? 'open' : ''}><summary style="cursor:pointer;color:var(--brume);font:13px var(--mono)">Demande de maintenance</summary>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 14px;margin-top:10px">
          <label class="champ"><span>Demande reçue le</span><input type="date" name="demande_recue_le" value="${a.demande_recue_le || ''}"></label>
          <label class="champ"><span>Emplacement / équipement</span><input name="emplacement" value="${esc(a.emplacement)}"></label>
          <label class="champ"><span>Département responsable</span><select name="departement"><option value="">—</option>${optsTexte(['Entretien / maintenance', 'Bâtiment / infrastructures', 'Opérations', 'TI', 'SST', 'Autre'], a.departement)}</select></label>
          <label class="champ"><span>Compagnie responsable</span><input name="compagnie" value="${esc(a.compagnie)}"></label>
          <label class="champ large"><span>Problème signalé</span><textarea name="probleme_signale">${esc(a.probleme_signale)}</textarea></label>
          <label class="champ large"><span>Travaux réalisés</span><textarea name="travaux_realises">${esc(a.travaux_realises)}</textarea></label>
        </div></details>
    </div>
    <div class="pied">
      ${nouveau ? '' : '<button type="button" class="btn danger gauche" id="suppr">Supprimer</button>'}
      <button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button>
    </div></form>`, async fd => {
    const vide = k => (fd.get(k) || '').trim() || null;
    const je = fd.get('journee_entiere') === 'on';
    const ligne = {
      titre: fd.get('titre').trim(), statut: fd.get('statut'), type: fd.get('type'), prochain_geste: vide('prochain_geste'),
      journee_entiere: je,
      planifie_debut: je ? (fd.get('jour') ? minuitLocal(fd.get('jour')) : null) : depuisLocal(fd.get('planifie_debut')),
      planifie_fin: je ? null : depuisLocal(fd.get('planifie_fin')),
      echeance: vide('echeance'), relance: vide('relance'), priorite: fd.get('priorite') ? +fd.get('priorite') : null,
      duree_min: fd.get('duree_min') ? +fd.get('duree_min') : null,
      projet_id: vide('projet_id'), domaine_id: vide('domaine_id'), hors_projet: fd.get('hors_projet') === 'on',
      dans_perimetre: fd.get('dans_perimetre') === '' ? null : fd.get('dans_perimetre') === 'true',
      delegue_a_id: vide('delegue_a_id'), en_attente_de_id: vide('en_attente_de_id'), motif_blocage: vide('motif_blocage'),
      contexte: fd.getAll('contexte'), lieu: vide('lieu'), reference_externe: vide('reference_externe'), notes: vide('notes'),
      demande_recue_le: vide('demande_recue_le'), emplacement: vide('emplacement'), departement: vide('departement'),
      compagnie: vide('compagnie'), probleme_signale: vide('probleme_signale'), travaux_realises: vide('travaux_realises'),
    };
    if (ligne.statut !== 'Terminé') ligne.realisee_le = null;
    const { error } = nouveau ? await sb.from('actions').insert(ligne) : await sb.from('actions').update(ligne).eq('id', a.id);
    if (error) { toast('Échec : ' + error.message); return false; }
    toast(nouveau ? 'Action ajoutée' : 'Enregistré'); rafraichir();
  });
  const cb = d.querySelector('[name=journee_entiere]');
  const bascule = () => { d.querySelectorAll('.heure').forEach(e => e.hidden = cb.checked); d.querySelector('.jourent').hidden = !cb.checked; };
  cb.onchange = bascule; bascule();
  const s = d.querySelector('#suppr');
  if (s) s.onclick = async () => {
    if (s.dataset.confirme !== '1') { s.dataset.confirme = '1'; s.textContent = 'Confirmer la suppression'; return; }
    const { error } = await sb.from('actions').delete().eq('id', a.id);
    if (error) return toast('Échec : ' + error.message);
    d.close(); toast('Supprimé'); rafraichir();
  };
}


/* ---------- Fiche projet ---------- */
function ouvrirProjet(p) {
  const nouveau = !p.id;
  const d = dialogue(`<form>
    <div class="tete-d"><h2>${nouveau ? 'Nouveau projet' : 'Modifier le projet'}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
    <div class="corps">
      <label class="champ large"><span>Nom</span><input name="titre" class="titre-saisie" required value="${esc(p.titre)}" ${nouveau ? 'autofocus' : ''}></label>
      <label class="champ"><span>Statut</span><select name="statut">${optsTexte(STATUTS_PROJET, p.statut)}</select></label>
      <label class="champ"><span>Nature</span><select name="nature">${optsTexte(['Projet ponctuel', 'Amélioration continue'], p.nature)}</select></label>
      <label class="champ"><span>Niveau</span><select name="niveau">${optsTexte(['Objectif', 'Projet', 'Sous-projet'], p.niveau)}</select></label>
      <label class="champ"><span>Priorité</span><select name="priorite"><option value="">—</option>${Object.entries(PRIOS).map(([k, l]) => `<option value="${k}" ${String(p.priorite) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="champ"><span>Début</span><input type="date" name="debut" value="${p.debut || ''}"></label>
      <label class="champ"><span>Cible</span><input type="date" name="cible" value="${p.cible || ''}"></label>
      <label class="champ"><span>Domaine</span><select name="domaine_id">${opts(S.domaines, p.domaine_id)}</select></label>
      <label class="champ"><span>Responsable</span><select name="responsable_id">${opts(S.personnes, p.responsable_id)}</select></label>
      <label class="champ"><span>Projet parent</span><select name="parent_id">${opts(S.projets.filter(x => x.id !== p.id), p.parent_id, { lib: 'titre' })}</select></label>
      <label class="champ"><span>Budget prévu ($)</span><input type="number" step="0.01" name="budget_prevu" value="${p.budget_prevu ?? ''}"></label>
      <label class="champ large"><span>Résultat attendu</span><textarea name="resultat_attendu" placeholder="Quel changement concret doit être obtenu?">${esc(p.resultat_attendu)}</textarea></label>
      <label class="champ large"><span>Notes</span><textarea name="notes">${esc(p.notes)}</textarea></label>
    </div>
    <div class="pied">${nouveau ? '' : '<button type="button" class="btn danger gauche" id="supprP">Supprimer</button>'}
      <button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div>
  </form>`, async fd => {
    const vide = k => (fd.get(k) || '').trim() || null;
    const ligne = { titre: fd.get('titre').trim(), statut: fd.get('statut'), nature: fd.get('nature'), niveau: fd.get('niveau'),
      priorite: fd.get('priorite') ? +fd.get('priorite') : null, debut: vide('debut'), cible: vide('cible'), domaine_id: vide('domaine_id'),
      responsable_id: vide('responsable_id'), parent_id: vide('parent_id'), budget_prevu: fd.get('budget_prevu') ? +fd.get('budget_prevu') : null,
      resultat_attendu: vide('resultat_attendu'), notes: vide('notes') };
    const r = nouveau ? await sb.from('projets').insert(ligne).select('id').single() : await sb.from('projets').update(ligne).eq('id', p.id);
    if (r.error) { toast('Échec : ' + r.error.message); return false; }
    toast(nouveau ? 'Projet créé' : 'Enregistré');
    await charger();
    if (nouveau) { S.vue = 'projet'; S.projetId = r.data.id; }
    rendre();
  });
  const s = d.querySelector('#supprP');
  if (s) s.onclick = async () => {
    if (s.dataset.confirme !== '1') { s.dataset.confirme = '1'; s.textContent = 'Confirmer (les actions restent, sans projet)'; return; }
    const { error } = await sb.from('projets').delete().eq('id', p.id);
    if (error) return toast('Échec : ' + error.message);
    d.close(); toast('Projet supprimé'); S.vue = 'projets'; rafraichir();
  };
}

/* ---------- Fiches personne et domaine ---------- */
function ouvrirPersonne(p) {
  const nouveau = !p.id;
  dialogue(`<form>
    <div class="tete-d"><h2>${nouveau ? 'Nouvelle personne' : esc(p.nom)}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
    <div class="corps">
      <label class="champ large"><span>Nom</span><input name="nom" required value="${esc(p.nom)}" ${nouveau ? 'autofocus' : ''}></label>
      <label class="champ"><span>Nature</span><select name="nature">${optsTexte(['Personne', 'Équipe', 'Organisation'], p.nature)}</select></label>
      <label class="champ"><span>Fonction</span><input name="fonction" value="${esc(p.fonction)}"></label>
      <label class="champ"><span>Courriel</span><input type="email" name="courriel" value="${esc(p.courriel)}"></label>
      <label class="champ"><span>Téléphone</span><input type="tel" name="telephone" value="${esc(p.telephone)}"></label>
      <label class="champ"><span>Compagnie</span><select name="compagnie_id">${opts(S.unites.filter(u => u.categorie === 'Organisation'), p.compagnie_id)}</select></label>
      <label class="champ"><span>Département</span><select name="departement_id">${opts(S.unites.filter(u => u.categorie !== 'Organisation'), p.departement_id)}</select></label>
      ${p.id ? `<p class="champ large aide" style="margin:0">${S.titulaires.filter(t => t.personne_id === p.id).map(t => esc(parId(S.postes, t.poste_id)?.titre)).join(', ') || 'Aucun poste dans l’organigramme'}</p>` : ''}
      <label class="champ large"><span>Notes</span><textarea name="notes">${esc(p.notes)}</textarea></label>
    </div>
    <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div>
  </form>`, async fd => {
    const vide = k => (fd.get(k) || '').trim() || null;
    const ligne = { nom: fd.get('nom').trim(), nature: fd.get('nature'), fonction: vide('fonction'), courriel: vide('courriel'), telephone: vide('telephone'), notes: vide('notes'), compagnie_id: vide('compagnie_id'), departement_id: vide('departement_id') };
    const { error } = nouveau ? await sb.from('personnes').insert(ligne) : await sb.from('personnes').update(ligne).eq('id', p.id);
    if (error) { toast('Échec : ' + error.message); return false; }
    toast('Enregistré'); rafraichir();
  });
}
function ouvrirDomaine(dm) {
  const nouveau = !dm.id;
  dialogue(`<form>
    <div class="tete-d"><h2>${nouveau ? 'Nouveau domaine' : esc(dm.nom)}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
    <div class="corps">
      <label class="champ large"><span>Nom</span><input name="nom" required value="${esc(dm.nom)}"></label>
      <label class="champ large"><span>Intention</span><input name="intention" value="${esc(dm.intention)}"></label>
      <label class="champ"><span>Ordre</span><input type="number" name="ordre" value="${dm.ordre ?? ''}"></label>
    </div>
    <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div>
  </form>`, async fd => {
    const ligne = { nom: fd.get('nom').trim(), intention: (fd.get('intention') || '').trim() || null, ordre: fd.get('ordre') ? +fd.get('ordre') : null };
    const { error } = nouveau ? await sb.from('domaines').insert(ligne) : await sb.from('domaines').update(ligne).eq('id', dm.id);
    if (error) { toast('Échec : ' + error.message); return false; }
    toast('Enregistré'); rafraichir();
  });
}

/* ================= Connexion ================= */
function rendreConnexion(app, message = '') {
  app.innerHTML = `<div class="connexion"><form id="fConn">
    <div class="marque">${LOGO}ORBITE</div>
    <p>Connecte-toi pour retrouver tes tâches, ton agenda et tes projets.</p>
    <label class="champ"><span>Courriel</span><input type="email" name="courriel" required autocomplete="email" autofocus></label>
    <label class="champ"><span>Mot de passe</span><input type="password" name="mdp" required minlength="8" autocomplete="current-password"></label>
    <div class="erreur" id="err">${esc(message)}</div>
    <button class="btn primaire" type="submit">Se connecter</button>
    <button class="btn" type="button" id="creer">Créer le compte</button>
  </form></div>`;
  const f = $('#fConn'), err = $('#err');
  f.onsubmit = async e => {
    e.preventDefault(); err.textContent = '';
    const { error } = await sb.auth.signInWithPassword({ email: f.courriel.value, password: f.mdp.value });
    if (error) err.textContent = error.message === 'Invalid login credentials' ? 'Courriel ou mot de passe incorrect.' : error.message === 'Email not confirmed' ? 'Confirme d’abord ton courriel avec le lien reçu.' : error.message;
  };
  $('#creer').onclick = async () => {
    if (!f.reportValidity()) return;
    err.textContent = '';
    const { data, error } = await sb.auth.signUp({ email: f.courriel.value, password: f.mdp.value, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) return err.textContent = error.message;
    if (!data.session) err.style.color = 'var(--vert)', err.textContent = 'Compte créé. Clique le lien de confirmation reçu par courriel, puis connecte-toi.';
  };
}

async function demarrer(session) {
  if (!session) { S.session = null; return rendre(); }
  const { data: ok, error } = await sb.rpc('reclamer_orbite');
  const horsReseau = error && (!navigator.onLine || /fetch|network|load failed/i.test(error.message || ''));
  if (!horsReseau && (error || !ok)) { await sb.auth.signOut(); S.session = null; return rendreConnexion($('#app'), 'Ce compte n’a pas accès à ORBITE.'); }
  S.session = session;
  const h = location.hash.slice(1); if (MODULES.some(m => m.k === h)) S.vue = h;
  $('#app').innerHTML = '<div class="connexion"><p style="color:var(--brume);font-family:var(--mono)">Chargement…</p></div>';
  majMeteo();
  try { await charger(); rendre(); X.viderFile(); } catch (e) { $('#app').innerHTML = `<div class="connexion"><p class="erreur">Impossible de charger les données : ${esc(e.message)}</p></div>`; }
}

M = installerModules({ sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, jourLong, cleJour, fmtHeure, versLocal, depuisLocal,
  dialogue, rafraichir, rendre: () => rendre(), liste, ouvert, enRetard, manquants, carteProjet, ouvrirPersonne, ouvrirAction, MODULES, ico });

X = installerExtras({ sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, dialogue, rafraichir, liste, ouvert, COULEURS_CAL });

let derniereSession;
sb.auth.onAuthStateChange((evt, session) => {
  const id = session?.user?.id || null;
  if (id === derniereSession && evt !== 'SIGNED_OUT') return;
  derniereSession = id;
  demarrer(session);
});

document.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'n' && S.session && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); ouvrirCapture(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.session && !document.querySelector('dialog[open]')) rafraichir().catch(() => {}); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
