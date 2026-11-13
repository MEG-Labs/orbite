import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_KEY, FUSEAU } from './config.js';
import { installerModules } from './modules.js';
import { installerExtras } from './extras.js';
import { installerLot5 } from './lot5.js';
import { installerLot6 } from './lot6.js';
import { installerLot7 } from './lot7.js';
import { installerLot8 } from './lot8.js';

const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

/* ================= Constantes ================= */
const STATUTS = ['À traiter', 'À faire', 'En cours', 'En attente', 'Bloqué', 'Terminé', 'Annulé'];
const OUVERTS = ['À traiter', 'À faire', 'En cours', 'En attente', 'Bloqué'];
const TYPES = ['Tâche', 'Événement', 'Jalon', 'Rappel'];
const PRIOS = { 1: '1 — Critique', 2: '2 — Haute', 3: '3 — Normale', 4: '4 — Basse' };
const STATUTS_PROJET = ['À envisager', 'À planifier', 'Actif', 'En pause', 'Terminé', 'Annulé'];
const CONTEXTES = ['Maison', 'Bureau', 'Téléphone', 'Ordinateur', 'Courses', 'Partout'];
// Interruptions de support opérationnel (consignées avec ⚡ ou la touche I).
const DEPTS_INTERRUPTION = ['Réception', 'Expédition', 'Conteneurs', 'Inventaire', 'Maintenance', 'Transport', 'Direction / bureau', 'Autre'];
const TYPES_INTERRUPTION = ['SAP / EWM', 'Équipement / RF', 'Données / rapport', 'Procédure / question', 'Problème opérationnel', 'Autre'];

const S = { session: null, actions: [], projets: [], domaines: [], personnes: [], vue: 'accueil', filtres: {}, agendaPasses: false,
  vehicules: [], entretiens: [], interventions: [], intEnt: [], livres: [], achats: [], abonnements: [], trajets: [], routines: [], notes: [], budget: [], regles: [],
  unites: [], postes: [], titulaires: [], participations: [], reglages: [], journal: [], cahiers: [], push: [], file: [], horsLigne: null };
let M, X, L, L6, L7, L8; // modules, installés après la définition des fonctions communes

const MODULES = [
  { k: 'accueil', l: 'Accueil', g: 'Pilotage', principal: true },
  { k: 'agenda', l: 'Agenda', g: 'Pilotage', principal: true },
  { k: 'projets', l: 'Projets', g: 'Pilotage', principal: true },
  { k: 'actions', l: 'Actions', g: 'Pilotage', principal: true },
  { k: 'delegations', l: 'Délégations', g: 'Pilotage' },
  { k: 'engagements', l: 'Engagements', g: 'Pilotage' },
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
  if (!a.domaine_id && !domaineProjet(a.projet_id)) m.push('domaine');
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
  engagements: '<path d="M4 5h16v11H10l-5 4v-4H4z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8.5 10.5 2.5 2.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="2"/>',
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
    cahiers: sb.from('cahiers').select('*').order('titre'),
    budget: sb.from('budget_lignes').select('*'),
    regles: sb.from('regles_classement').select('*'),
    unites: sb.from('unites').select('*').order('nom'),
    postes: sb.from('postes').select('*'),
    titulaires: sb.from('postes_titulaires').select('*'),
    participations: sb.from('participations').select('*'),
    reglages: sb.from('reglages').select('*'),
    journal: sb.from('journal_jours').select('*').order('date', { ascending: false }).limit(120),
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
  // Trajets passés qui ne sont pas à ma charge : marqués « Fait » (aussi fait côté serveur aux 15 minutes).
  const moiT = S.reglages.find(r => r.cle === 'moi_transport')?.valeur || 'Papa';
  const trajetsPasses = S.trajets.filter(t => t.date_heure && !['Fait', 'Annulé'].includes(t.statut) && t.responsable !== moiT && new Date(t.date_heure).getTime() + 30 * 6e4 < maintenant.getTime());
  if (trajetsPasses.length) {
    const { error } = await sb.from('trajets').update({ statut: 'Fait' }).in('id', trajetsPasses.map(t => t.id));
    if (!error) trajetsPasses.forEach(t => { t.statut = 'Fait'; });
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
      <button class="btn-recherche" id="btnRecherche" aria-label="Chercher partout" title="Chercher partout (Ctrl+K)"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg><span>Chercher</span><kbd>Ctrl K</kbd></button>
      <div class="horloge" id="horloge"></div>
    </header>
    <div class="coquille">
      <nav class="nav" aria-label="Sections">
        ${navHtml}
        <div class="compte">${esc(S.session.user.email)}<br><button class="btn discret" id="deco" style="padding:4px 0">Se déconnecter</button></div>
      </nav>
      <main id="vue">${S.horsLigne ? `<div class="bandeau-horsligne">Hors ligne · données du ${esc(fmtJour.format(new Date(S.horsLigne)))} à ${esc(fmtHeure.format(new Date(S.horsLigne)))}. Tes captures seront envoyées au retour du réseau.</div>` : ''}</main>
    </div>
    <button class="fab-fly" id="fabFly" aria-label="Consigner une tâche faite sur le fly" title="Fait sur le fly (F)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z" fill="currentColor"/></svg></button>
    <button class="fab" id="fab" aria-label="Capture rapide" title="Capture rapide (N)">${ico('plus')}</button>`;
  app.querySelectorAll('[data-vue]').forEach(b => b.onclick = () => { S.vue = b.dataset.vue; S.filtres = {}; S.reorg = false; history.replaceState(null, '', S.vue === 'accueil' ? location.pathname : '#' + S.vue); rendre(); window.scrollTo(0, 0); });
  $('#fab').onclick = () => ouvrirCapture();
  $('#fabFly').onclick = () => ouvrirSurLeFly();
  $('#btnRecherche').onclick = () => L.ouvrirRecherche();
  $('#deco').onclick = async () => { await sb.auth.signOut(); };
  horloge();
  const v = document.createElement('div'); $('#vue').appendChild(v);
  ({ accueil: vueAccueil, agenda: vueAgenda, projets: vueProjets, projet: vueProjet, actions: vueActions, reperes: vueReperes, ...M.vues, ...X.vues, ...L7.vues,
    reglages: async v => { await X.vues.reglages(v); L.complementReglages(v); } }[S.vue] || vueAccueil)(v);
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
    // L'alerte pneus dépend de la température : on redessine l'accueil si elle apparaît ou disparaît.
    if (S.session && S.vue === 'accueil' && L && !document.querySelector('dialog[open]') && !!L.alertePneus() !== !!document.querySelector('.alerte-pneus')) rendre();
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
function ligne(a, { montrerProjet = true, heureSeule = false, montrerPromis = true } = {}) {
  const p = parId(S.projets, a.projet_id);
  const evt = a.type === 'Événement';
  // Un événement passé ou terminé est grisé (pas barré) : il a eu lieu.
  const passe = evt && a.statut !== 'Annulé' && (!ouvert(a) || new Date(a.planifie_fin || a.planifie_debut) < new Date());
  const ferme = !ouvert(a) && !passe;
  const meta = [];
  if (a.statut !== 'À faire' && !evt) meta.push(`<span class="pastille st-${esc(a.statut)}">${esc(a.statut)}</span>`);
  if (a.priorite && a.priorite <= 2) meta.push(`<span class="pastille prio-${a.priorite}">P${a.priorite}</span>`);
  if (montrerProjet && p) meta.push(`<span>${esc(p.titre)}</span>`);
  if (a.echeance) meta.push(`<span class="${enRetard(a) ? 'retard' : ''}">Échéance ${esc(jourDate(a.echeance))}${enRetard(a) ? ' · en retard' : ''}</span>`);
  if (a.relance) meta.push(`<span>Relance ${esc(jourDate(a.relance))}</span>`);
  const deleg = parId(S.personnes, a.delegue_a_id); if (deleg) meta.push(`<span>Délégué à ${esc(deleg.nom)}</span>`);
  const att = parId(S.personnes, a.en_attente_de_id); if (att) meta.push(`<span>Attend ${esc(att.nom)}</span>`);
  const prom = montrerPromis && parId(S.personnes, a.promis_a_id); if (prom) meta.push(`<span class="promis">🤝 Promis à ${esc(prom.nom)}</span>`);
  else if (montrerPromis && a.interruption && a.demandeur && ouvert(a)) meta.push(`<span class="promis">🤝 Promis à ${esc(a.demandeur)}</span>`);
  if (a.interruption) meta.push(`<span class="pastille interruption" title="Interruption de support opérationnel">🚨 ${esc([a.interruption_dept, a.interruption_type].filter(Boolean).join(' · ') || 'interruption')}</span>${a.demandeur && !ouvert(a) ? `<span>Pour ${esc(a.demandeur)}</span>` : ''}`);
  else if (a.sur_le_fly) meta.push(`<span class="pastille fly" title="Faite sur le fly">⚡ sur le fly</span>`);
  if (a.motif_blocage) meta.push(`<span>${esc(a.motif_blocage)}</span>`);
  if (a.recurrence?.type) meta.push(a.recurrence.sautee ? '<span class="pastille recur">🔁 sautée</span>' : `<span class="pastille recur" title="${esc(libRecurrence(a.recurrence))}">🔁 ${esc(libRecurrence(a.recurrence, { court: true }))}</span>`);
  if (a.reference_externe && /^[A-Z][A-Z0-9]+-\d+$/.test(a.reference_externe.trim())) {
    const dom = S.reglages.find(r => r.cle === 'jira_domaine')?.valeur || 'canac.atlassian.net';
    meta.push(`<a class="lien-jira" href="https://${esc(dom)}/browse/${esc(a.reference_externe.trim())}" target="_blank" rel="noopener">${esc(a.reference_externe.trim())}${a.statut_jira ? ' · ' + esc(a.statut_jira) : ''}</a>`);
  }
  const cal = calendrierDe(a);
  if (cal) meta.push(`<span class="pastille pastille-cal" style="--cal:${esc(cal.couleur)}">${esc(cal.nom)}</span>`);
  const m = manquants(a);
  return `<li class="ligne ${ferme ? 'ferme' : ''}${passe ? ' passe' : ''}" data-id="${a.id}">
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
/* ---------- Glisser-déposer (accueil) ---------- */
// Toute tâche ouverte de l’accueil peut être glissée : sur « En cours » pour la commencer,
// ou sur la zone « Terminer » qui apparaît en bas de l’écran pendant le glissement.
// Souris : on glisse dès 6 px de mouvement. Tactile : appui long (350 ms) puis on glisse; un mouvement avant défile normalement.
let glisseEnCours = null;
document.addEventListener('touchmove', e => { if (glisseEnCours?.actif) e.preventDefault(); }, { passive: false });
function brancherGlisser(v) {
  const blocEnCours = v.querySelector('[data-depot="en-cours"]');
  const vus = new Set();
  v.querySelectorAll('.ligne[data-id]').forEach(li => {
    const a = parId(S.actions, li.dataset.id);
    if (!a || a.type === 'Événement' || !ouvert(a) || li.closest('dialog')) return;
    li.classList.add('glissable');
    li.title = a.statut === 'En cours' ? 'Glisser vers « Terminer »' : 'Glisser vers « En cours » ou « Terminer »';
    // Empêche la sélection de texte de démarrer quand on attrape la ligne à la souris.
    li.addEventListener('mousedown', e => { if (!e.target.closest('button, a, input, select')) e.preventDefault(); });
    li.addEventListener('selectstart', e => e.preventDefault());
    li.addEventListener('dragstart', e => e.preventDefault());
    li.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, a, input, select')) return;
      const g = glisseEnCours = { li, a, x: e.clientX, y: e.clientY, id: e.pointerId, actif: false, tactile: e.pointerType !== 'mouse', minuterie: null, cible: null };
      g.demarrer = () => {
        g.actif = true; li.setPointerCapture(g.id);
        const r = li.getBoundingClientRect();
        g.fantome = li.cloneNode(true); g.fantome.classList.add('fantome-glisse'); g.fantome.removeAttribute('title');
        Object.assign(g.fantome.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
        g.dx = g.x - r.left; g.dy = g.y - r.top;
        document.body.appendChild(g.fantome); li.classList.add('en-glisse');
        // Cibles : En cours (si la tâche n’y est pas déjà) et la zone Terminer.
        g.terminer = document.createElement('div');
        g.terminer.className = 'zone-terminer';
        g.terminer.innerHTML = '<span>✓</span> Déposer ici pour terminer';
        document.body.appendChild(g.terminer);
        requestAnimationFrame(() => g.terminer.classList.add('visible'));
        g.cibles = [{ el: g.terminer, quoi: 'terminer' }];
        if (blocEnCours && a.statut !== 'En cours') { g.cibles.push({ el: blocEnCours, quoi: 'en-cours' }); blocEnCours.classList.add('cible-depot'); }
        if (g.tactile && navigator.vibrate) navigator.vibrate(15);
      };
      if (g.tactile) g.minuterie = setTimeout(g.demarrer, 350);
    });
    li.addEventListener('pointermove', e => {
      const g = glisseEnCours; if (!g || g.li !== li) return;
      const d = Math.hypot(e.clientX - g.x, e.clientY - g.y);
      if (!g.actif) {
        if (g.tactile) { if (d > 8) { clearTimeout(g.minuterie); glisseEnCours = null; } return; }
        if (d > 6) g.demarrer(); else return;
      }
      g.fantome.style.left = e.clientX - g.dx + 'px'; g.fantome.style.top = e.clientY - g.dy + 'px';
      g.cible = null;
      for (const c of g.cibles) {
        const r = c.el.getBoundingClientRect();
        const dessus = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        c.el.classList.toggle('survol-depot', dessus && !g.cible);
        if (dessus && !g.cible) g.cible = c.quoi;
      }
      // Défilement automatique près des bords (sauf au-dessus de la zone Terminer).
      if (e.clientY < 70) window.scrollBy(0, -12);
      else if (e.clientY > innerHeight - 90 && g.cible !== 'terminer') window.scrollBy(0, 12);
    });
    const finir = async () => {
      const g = glisseEnCours; if (!g || g.li !== li) return;
      clearTimeout(g.minuterie); glisseEnCours = null;
      if (!g.actif) return;
      g.fantome.remove(); g.terminer.remove(); li.classList.remove('en-glisse');
      blocEnCours?.classList.remove('cible-depot', 'survol-depot');
      li.addEventListener('click', ev => ev.stopImmediatePropagation(), { capture: true, once: true });
      if (g.cible === 'en-cours') {
        if (await majAction(g.a.id, { statut: 'En cours' })) { toast(`« ${g.a.titre} » en cours`); rafraichir(); }
      } else if (g.cible === 'terminer') {
        if (await majAction(g.a.id, { statut: 'Terminé', realisee_le: new Date().toISOString() })) {
          if (g.a.recurrence) { await rafraichir(); annoncerSuivante(g.a.id, `✓ « ${g.a.titre} » terminée`); } else { toast(`✓ « ${g.a.titre} » terminée`); rafraichir(); }
        }
      }
    };
    li.addEventListener('pointerup', finir);
    li.addEventListener('pointercancel', finir);
    li.addEventListener('contextmenu', e => { if (glisseEnCours?.li === li) e.preventDefault(); });
  });
}

function brancherLignes(racine) {
  racine.querySelectorAll('[data-coche]').forEach(b => b.onclick = async e => {
    e.stopPropagation();
    const a = parId(S.actions, b.dataset.coche);
    const nouveau = a.statut === 'Terminé' ? 'À faire' : 'Terminé';
    if (await majAction(a.id, { statut: nouveau, realisee_le: nouveau === 'Terminé' ? new Date().toISOString() : null })) {
      if (nouveau === 'Terminé' && a.recurrence) { await rafraichir(); return annoncerSuivante(a.id, 'Terminé'); }
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

/* ---------- Réorganisation de l’accueil ---------- */
// Bouton « Réorganiser l’accueil » (bas de l’accueil) : les encadrés se glissent par leur poignée ⠿,
// en haut (pleine largeur), dans la colonne de gauche ou de droite, ou en bas (pleine largeur, sous les colonnes).
// Sur téléphone, tout s’empile dans cet ordre : haut, gauche, droite, bas. La disposition est gardée dans le réglage `disposition_accueil` et suit le compte.
const ENCADRES = {
  evenements: 'Aujourd’hui (événements et charge)', conflits: 'Conflits famille et travail', compteurs: 'Compteurs',
  plan: 'Aujourd’hui, je fais', habitudes: 'Habitudes du jour', 'en-cours': 'En cours', planifiees: 'Tâches planifiées · 7 jours',
  'a-completer': 'À compléter', backlog: 'Backlog et engagements', transports: 'Transports du jour', promesses: 'Promesses à tenir', surveiller: 'À surveiller',
  blocages: 'Blocages et relances', projets: 'Projets en mouvement (Kanban)' };
const ZONES = { haut: 'Haut · pleine largeur', gauche: 'Colonne de gauche', droite: 'Colonne de droite', bas: 'Bas · pleine largeur' };
const DISPO_DEFAUT = { haut: ['evenements', 'conflits', 'compteurs'], gauche: ['plan', 'habitudes', 'en-cours', 'planifiees', 'a-completer', 'backlog'],
  droite: ['transports', 'promesses', 'surveiller', 'blocages'], bas: ['projets'] };
function dispositionAccueil() {
  const r = S.reglages.find(x => x.cle === 'disposition_accueil')?.valeur;
  const d = { haut: [], gauche: [], droite: [], bas: [] }, vus = new Set();
  // Disposition enregistrée avant l’ajout de la zone du bas : le Kanban des projets descend une fois en bas
  // (pleine largeur); ensuite, il reste là où il a été glissé.
  const avantBas = r && typeof r === 'object' && !Array.isArray(r.bas);
  if (r && typeof r === 'object') for (const z of Object.keys(d)) (Array.isArray(r[z]) ? r[z] : []).forEach(k => {
    if (avantBas && k === 'projets') return;
    if (ENCADRES[k] && !vus.has(k)) { d[z].push(k); vus.add(k); }
  });
  // Encadré absent de la disposition enregistrée (ajouté à ORBITE plus tard) : à sa place par défaut, après son voisin d’origine.
  for (const z of Object.keys(DISPO_DEFAUT)) DISPO_DEFAUT[z].forEach((k, i) => {
    if (vus.has(k)) return;
    const voisin = DISPO_DEFAUT[z].slice(0, i).reverse().find(x => d[z].includes(x));
    d[z].splice(voisin ? d[z].indexOf(voisin) + 1 : 0, 0, k); vus.add(k);
  });
  return d;
}
function encadre(k, html) {
  if (!S.reorg) return html ? `<div class="encadre" data-encadre="${k}">${html}</div>` : '';
  // En mode réorganiser : poignée + aperçu tronqué et inerte; un encadré vide reste visible pour pouvoir le placer.
  return `<div class="encadre" data-encadre="${k}"><button type="button" class="poignee-encadre" aria-label="Déplacer « ${esc(ENCADRES[k])} » (flèches pour déplacer)"><span aria-hidden="true">⠿</span>${esc(ENCADRES[k])}</button>
    <div class="apercu-encadre" inert>${html || '<div class="vide">Vide pour l’instant · s’affichera ici quand il y aura du contenu.</div>'}</div></div>`;
}
function lireDisposition(racine) {
  const d = {};
  racine.querySelectorAll('[data-zone]').forEach(z => { d[z.dataset.zone] = [...z.querySelectorAll(':scope > .encadre')].map(e => e.dataset.encadre); });
  return d;
}
async function enregistrerDisposition(d) {
  const r = S.reglages.find(x => x.cle === 'disposition_accueil');
  if (r) r.valeur = d; else S.reglages.push({ cle: 'disposition_accueil', valeur: d });
  const { error } = await sb.from('reglages').upsert({ cle: 'disposition_accueil', valeur: d });
  if (error) toast('Disposition non enregistrée : ' + error.message);
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && S.reorg && S.vue === 'accueil' && !document.querySelector('dialog[open]') && !document.body.classList.contains('glisse-encadre')) { S.reorg = false; rendre(); }
});
function brancherReorg(v) {
  const btn = v.querySelector('#reorg'); if (btn) btn.onclick = () => { S.reorg = true; rendre(); };
  const fin = v.querySelector('#finReorg'); if (fin) fin.onclick = () => { S.reorg = false; rendre(); toast('Disposition enregistrée'); };
  if (!S.reorg) return;
  // La barre du mode réorganiser colle juste sous le bandeau (lui-même collant).
  const barre = v.querySelector('.barre-reorg'), bandeau = document.querySelector('.bandeau');
  if (barre && bandeau) barre.style.top = bandeau.offsetHeight + 8 + 'px';
  const racine = v.querySelector('.accueil-encadres');
  const zones = [...racine.querySelectorAll('[data-zone]')];
  const ordreZones = ['haut', 'gauche', 'droite', 'bas'];
  v.querySelectorAll('.poignee-encadre').forEach(h => {
    const enc = h.closest('.encadre');
    // Clavier : ↑ ↓ dans la zone, ← → vers la zone voisine.
    h.addEventListener('keydown', e => {
      const z = enc.parentElement;
      if (e.key === 'ArrowUp' && enc.previousElementSibling) z.insertBefore(enc, enc.previousElementSibling);
      else if (e.key === 'ArrowDown' && enc.nextElementSibling) z.insertBefore(enc.nextElementSibling, enc);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const i = ordreZones.indexOf(z.dataset.zone) + (e.key === 'ArrowRight' ? 1 : -1);
        const cible = racine.querySelector(`[data-zone="${ordreZones[i]}"]`); if (!cible) return;
        cible.appendChild(enc);
      } else return;
      e.preventDefault(); h.focus(); enregistrerDisposition(lireDisposition(racine));
    });
    h.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const r = enc.getBoundingClientRect();
      const g = { dx: e.clientX - r.left, dy: e.clientY - r.top, x: e.clientX, y: e.clientY };
      const fantome = enc.cloneNode(true); fantome.classList.add('fantome-encadre');
      Object.assign(fantome.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
      const trou = document.createElement('div'); trou.className = 'trou-encadre'; trou.style.height = r.height + 'px';
      // L’encadré reste dans la page (masqué) : la capture du pointeur sur sa poignée doit survivre au glissement.
      enc.after(trou); enc.classList.add('encadre-masque');
      document.body.appendChild(fantome); document.body.classList.add('glisse-encadre');
      if (e.pointerType !== 'mouse' && navigator.vibrate) navigator.vibrate(15);
      // Défilement automatique tant que le pointeur reste près du haut ou du bas de l’écran.
      // Le placement est recalculé après chaque pas de défilement, même si le doigt ne bouge plus.
      const defil = setInterval(() => {
        const avant = scrollY;
        if (g.y < 80 + (bandeau?.offsetHeight || 0)) window.scrollBy(0, -14); else if (g.y > innerHeight - 110) window.scrollBy(0, 14);
        if (scrollY !== avant) placer();
      }, 16);
      const bouger = ev => { g.x = ev.clientX; g.y = ev.clientY; placer(); };
      const placer = () => {
        const x = g.x, y = g.y;
        fantome.style.left = x - g.dx + 'px'; fantome.style.top = y - g.dy + 'px';
        // Zone sous le pointeur, sinon la plus proche.
        let zone = null, best = Infinity;
        for (const z of zones) {
          const zr = z.getBoundingClientRect();
          const d = Math.hypot(x < zr.left ? zr.left - x : x > zr.right ? x - zr.right : 0, y < zr.top ? zr.top - y : y > zr.bottom ? y - zr.bottom : 0);
          if (d < best) { best = d; zone = z; }
        }
        // Position : avant le premier encadré dont le milieu est sous le pointeur.
        const avant = [...zone.querySelectorAll(':scope > .encadre')].find(f => { if (f === enc) return false; const fr = f.getBoundingClientRect(); return y < fr.top + fr.height / 2; });
        if (avant) { if (trou.nextElementSibling !== avant) zone.insertBefore(trou, avant); }
        else if (zone.lastElementChild !== trou) zone.appendChild(trou);
        zones.forEach(z => z.classList.toggle('zone-survol', z === zone));
      };
      const finir = () => {
        clearInterval(defil);
        h.removeEventListener('pointermove', bouger); h.removeEventListener('pointerup', finir); h.removeEventListener('pointercancel', finir);
        fantome.remove(); trou.replaceWith(enc); enc.classList.remove('encadre-masque');
        document.body.classList.remove('glisse-encadre'); zones.forEach(z => z.classList.remove('zone-survol'));
        enregistrerDisposition(lireDisposition(racine));
      };
      h.addEventListener('pointermove', bouger);
      h.addEventListener('pointerup', finir);
      h.addEventListener('pointercancel', finir);
    });
  });
}

/* ---------- Accueil ---------- */
function vueAccueil(v) {
  const auj = aujourdhui(), dans7 = plusJours(auj, 7);
  // Mode hors travail : les tâches et projets de travail sont masqués de l’accueil (les événements restent).
  const vis = S.actions.filter(L6.visible);
  const taches = vis.filter(a => a.type !== 'Événement');
  const enCours = taches.filter(a => a.statut === 'En cours').sort(triOuvert);
  const backlog = taches.filter(a => ['À faire', 'À traiter'].includes(a.statut)).sort(triOuvert);
  const bloques = vis.filter(a => ['Bloqué', 'En attente'].includes(a.statut) || (ouvert(a) && a.relance && a.relance <= auj));
  const retards = vis.filter(enRetard);
  const aTrier = vis.filter(a => a.statut === 'À traiter');
  const passes = S.actions.filter(evtPasse);
  const aVenir = vis.filter(a => ouvert(a) && a.planifie_debut && !evtPasse(a) && cleJour(a.planifie_debut) <= dans7).sort(triDate);
  const evenements = aVenir.filter(a => a.type === 'Événement');
  const semaine = aVenir.filter(a => a.type !== 'Événement');
  const demain = plusJours(auj, 1);
  const joursEvt = [...new Set(evenements.map(a => cleJour(a.planifie_debut) < auj ? auj : cleJour(a.planifie_debut)))];
  const libJour = j => j === auj ? 'Aujourd’hui' : j === demain ? 'Demain' : jourLong(j);
  const evtJour = j => evenements.filter(a => (cleJour(a.planifie_debut) < auj ? auj : cleJour(a.planifie_debut)) === j);
  // Aujourd’hui : on garde aussi les événements déjà passés ou terminés (grisés), pour concorder avec la barre de charge.
  const passesAuj = S.actions.filter(a => a.type === 'Événement' && a.statut !== 'Annulé' && a.planifie_debut && cleJour(a.planifie_debut) === auj && !evenements.includes(a));
  const evtAuj = [...passesAuj, ...evtJour(auj)].sort(triDate);
  const actifs = S.projets.filter(p => p.statut === 'Actif' && L6.projetVisible(p));
  const aCompleter = vis.filter(a => manquants(a).length);

  const cpt = (n, lbl, cls, cible) => `<button class="compteur ${n ? cls : 'calme'}" data-cible="${cible}"><b>${n}</b><span>${lbl}</span></button>`;
  // Chaque encadré déplaçable, par clé (voir ENCADRES). Une chaîne vide = rien à afficher pour l’instant.
  const B = {
    evenements: `<section class="bloc bloc-evenements"><header><h2>Aujourd’hui <span class="nb">${evtAuj.length}</span></h2><button class="btn discret" data-aller="agenda">Agenda</button></header>
      ${L.blocCharge()}
      ${liste(evtAuj, 'Aucun événement aujourd’hui.', { heureSeule: true })}
      <details class="plus-tard" ${S.evtOuverts ? 'open' : ''}><summary>7 prochains jours <span class="nb">${evenements.length - evtJour(auj).length}</span></summary>
        ${joursEvt.filter(j => j !== auj).map(j => `<div class="jour-evt"><h3>${esc(libJour(j))}</h3>${liste(evtJour(j), '', { heureSeule: true })}</div>`).join('') || '<div class="vide">Rien de prévu.</div>'}
      </details></section>`,
    conflits: L.blocConflits(),
    compteurs: `<section class="compteurs" aria-label="Indicateurs">
      ${cpt(enCours.length, 'En cours', L6.classeEnCours(enCours.length), 'en-cours')}
      ${cpt(taches.filter(ouvert).length, 'Tâches ouvertes', 'calme', 'ouvertes')}
      ${cpt(retards.length, 'En retard', 'alerte', 'retard')}
      ${cpt(bloques.length, 'Bloquées ou relances', 'attention', 'bloques')}
      ${cpt(aTrier.length, 'À trier', 'attention', 'trier')}
      ${cpt(actifs.length, 'Projets actifs', 'calme', 'projets')}
    </section>`,
    plan: X.blocPlan(),
    habitudes: M.blocHabitudes(),
    'en-cours': `<section class="bloc" data-depot="en-cours"><header><h2>En cours <span class="nb">${enCours.length}</span></h2></header>${L6.avertEnCours(enCours.length)}
      ${liste(enCours, 'Rien en cours. Passe une tâche du backlog à « En cours » pour la retrouver ici.')}</section>`,
    planifiees: `<section class="bloc" data-glisser><header><h2>Tâches planifiées · 7 jours <span class="nb">${semaine.length}</span></h2><button class="btn discret" data-aller="agenda">Agenda</button></header>
      ${liste(semaine, 'Aucune tâche planifiée cette semaine.')}</section>`,
    'a-completer': aCompleter.length ? `<section class="bloc"><header><h2>À compléter <span class="nb">${aCompleter.length}</span></h2></header>${liste(aCompleter.slice(0, 8), '')}</section>` : '',
    backlog: `<section class="bloc"><header><h2>Backlog et engagements <span class="nb">${backlog.length}</span></h2></header>
      ${liste(backlog, 'Backlog vide.')}</section>`,
    transports: M.encartTransports(),
    promesses: L7.encartPromesses(),
    surveiller: M.encartSurveiller(),
    blocages: bloques.length ? `<section class="bloc"><header><h2>Blocages et relances <span class="nb">${bloques.length}</span></h2></header>${liste(bloques, '')}</section>` : '',
    projets: kanbanProjets(actifs),
  };
  const dispo = dispositionAccueil();
  const zone = (z, cls) => `<div class="zone-accueil ${cls}" data-zone="${z}" data-libelle="${esc(ZONES[z])}">${dispo[z].map(k => encadre(k, B[k])).join('')}</div>`;

  // Bandeaux contextuels fixés en haut (non déplaçables) : mode hors travail, fermer ma journée, pneus, événements passés.
  v.innerHTML = `${L7.bandeauReprise()}${L6.bandeauMode()}${L6.blocFermeture()}
    ${M.bandeauRevue()}
    ${L.encartPneus()}
    ${passes.length ? `<div class="bloc signal" style="margin-bottom:22px"><header><h2>${passes.length} événement${passes.length > 1 ? 's' : ''} passé${passes.length > 1 ? 's' : ''} encore ouvert${passes.length > 1 ? 's' : ''}</h2>
      <div style="display:flex;gap:8px"><button class="btn discret" id="voirPasses">Voir</button><button class="btn" id="fermerPasses">Marquer terminés</button></div></header></div>` : ''}
    ${S.reorg ? `<div class="barre-reorg" role="region" aria-label="Réorganiser l’accueil"><div><b>Réorganiser l’accueil</b><span>Glisse un encadré par sa poignée ⠿ (ou flèches du clavier). Enregistré automatiquement sur ton compte.</span></div><button class="btn primaire" id="finReorg">Terminé</button></div>` : ''}
    <div class="accueil-encadres${S.reorg ? ' reorg-actif' : ''}">
      ${zone('haut', 'zone-haut')}
      <div class="grille">${zone('gauche', 'colonne')}${zone('droite', 'colonne')}</div>
      ${zone('bas', 'zone-bas')}
    </div>
    ${S.reorg ? '' : `<div class="pied-accueil"><button class="btn discret" id="reorg" title="Déplacer les encadrés de l’accueil">⠿ Réorganiser l’accueil</button></div>`}`;
  v.querySelectorAll('[data-aller]').forEach(b => b.onclick = () => { S.vue = b.dataset.aller; rendre(); });
  L.brancherConflits(v);
  L6.brancher(v);
  L7.brancher(v);
  v.querySelector('.bloc.plan-du-jour')?.setAttribute('data-glisser', '');
  if (!S.reorg) brancherGlisser(v);
  brancherReorg(v);
  M.brancherHabitudes(v);
  const pt = v.querySelector('details.plus-tard'); if (pt) pt.ontoggle = () => { S.evtOuverts = pt.open; };
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
// Kanban des projets actifs de l’accueil : une colonne par santé (calculée par sante()).
// La santé découle des tâches et des dates du projet; on ne la change pas en glissant une carte :
// on ouvre le projet (clic) et on agit sur ses tâches, sa cible ou sa prochaine action.
const COLONNES_SANTE = [
  { k: 'ko', l: 'En retard', aide: 'Au moins une tâche en retard, ou date cible dépassée.' },
  { k: 'risque', l: 'À surveiller', aide: 'Tâche bloquée, ou tâches ouvertes sans prochaine action définie.' },
  { k: 'ok', l: 'En santé', aide: 'Tâches à jour et prochaine action définie.' },
  { k: 'neutre', l: 'Sans tâches', aide: 'Aucune tâche liée à ce projet pour l’instant.' }];
function kanbanProjets(actifs) {
  const tri = (a, b) => (a.cible || '9999').localeCompare(b.cible || '9999') || a.titre.localeCompare(b.titre, 'fr');
  const col = c => {
    const ps = actifs.filter(p => sante(p) === c.k).sort(tri);
    return `<div class="kanban-col" data-sante="${c.k}" role="group" aria-label="${esc(c.l)} : ${ps.length} projet${ps.length > 1 ? 's' : ''}">
      <h3 title="${esc(c.aide)}"><span class="sante ${c.k}" aria-hidden="true"></span>${esc(c.l)} <span class="nb">${ps.length}</span></h3>
      <div class="kanban-cartes">${ps.map(carteProjet).join('') || '<div class="vide">Aucun</div>'}</div></div>`;
  };
  return `<section class="bloc bloc-kanban"><header><h2>Projets en mouvement <span class="nb">${actifs.length}</span></h2><button class="btn discret" data-aller="projets">Tous</button></header>
    ${actifs.length ? `<div class="kanban">${COLONNES_SANTE.map(col).join('')}</div>` : '<div class="vide">Aucun projet actif.</div>'}</section>`;
}
function carteProjet(p) {
  const pct = p.nb_taches ? Math.round(100 * p.nb_terminees / p.nb_taches) : 0;
  const s = sante(p);
  const libSante = { ok: 'En santé', risque: 'À surveiller', ko: 'En retard', neutre: 'Sans tâches' }[s];
  return `<div class="projet" data-projet="${p.id}" role="button" tabindex="0">
    <div class="tete"><span class="nom">${esc(p.titre)}</span><span class="sante ${s}" title="${libSante}" aria-label="${libSante}"></span></div>
    <div class="prochaine">${p.prochaine_action ? '▸ ' + esc(p.prochaine_action) : (p.nb_taches ? 'Aucune prochaine action définie' : 'Aucune tâche liée')}</div>
    <div class="chiffres"><span>${p.nb_terminees}/${p.nb_taches} terminées</span>${!p.domaine_id ? '<span class="rouge">Domaine à compléter</span>' : ''}${p.nb_retards ? `<span class="rouge">${p.nb_retards} en retard</span>` : ''}${p.cible ? `<span>Cible ${esc(jourDate(p.cible))}</span>` : ''}</div>
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
  const aff = L8.affichage(), kanban = aff.mode === 'kanban';
  const projets = S.projets.filter(p => f === 'tous' || p.statut === f);
  // En Kanban regroupé par statut, les colonnes remplacent les onglets de statut.
  const ongletsStatut = kanban && aff.groupe === 'statut' ? '' : `<div class="onglets">
      ${['Actif', 'À planifier', 'En pause', 'Terminé', 'tous'].map(s => `<button aria-pressed="${f === s}" data-sp="${s}">${s === 'tous' ? 'Tous' : s}</button>`).join('')}
    </div>`;
  v.innerHTML = `
    <h1>Projets et objectifs</h1><p class="sous-titre">Avancement, tâches et santé de chaque projet.</p>
    <div class="outils">${ongletsStatut}<button class="btn primaire" id="nouveauProjet">Nouveau projet</button></div>
    ${L8.barreAffichage()}
    ${kanban ? L8.kanban() : `<div class="cartes-projets">${projets.map(carteProjet).join('') || '<div class="bloc"><div class="vide">Aucun projet dans ce statut.</div></div>'}</div>`}`;
  v.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => { S.filtres.statutProjet = b.dataset.sp; rendre(); });
  $('#nouveauProjet').onclick = () => ouvrirProjet({ statut: 'Actif', nature: 'Projet ponctuel', niveau: 'Projet' });
  L8.brancherProjets(v);
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
        ${L.blocLigneTemps(p)}
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
  L.brancherLigneTemps(v, p);
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
  if (f.type === 'fly') items = items.filter(a => a.sur_le_fly);
  else if (f.type === 'interruption') items = items.filter(a => a.interruption);
  else if (f.type === 'recurrentes') items = items.filter(a => a.recurrence?.type && ouvert(a));
  else if (f.type) items = items.filter(a => a.type === f.type);
  if (f.projet) items = items.filter(a => f.projet === 'aucun' ? !a.projet_id : a.projet_id === f.projet);
  if (q) items = items.filter(a => [a.titre, a.prochain_geste, a.notes, a.reference_externe].some(x => (x || '').toLowerCase().includes(q)));
  if (f.type === 'fly' || f.type === 'interruption') items.sort((a, b) => (b.realisee_le || b.cree_le).localeCompare(a.realisee_le || a.cree_le));
  else if (f.type === 'recurrentes') items.sort((a, b) => (dateRef(a) || '9').localeCompare(dateRef(b) || '9'));
  else items.sort((a, b) => (ouvert(b) - ouvert(a)) || (b.planifie_debut || b.cree_le).localeCompare(a.planifie_debut || a.cree_le));
  const titreFiltre = { retard: 'En retard', bloques: 'Bloquées ou relances', passes: 'Événements passés encore ouverts' }[f.special];
  v.innerHTML = `
    <h1>Actions et agenda</h1><p class="sous-titre">${titreFiltre ? esc(titreFiltre) + ' · <button class="btn discret" id="effacer" style="padding:0">effacer le filtre</button>' : 'Tâches, événements, jalons et rappels.'}</p>
    <div class="outils">
      <input type="search" id="q" placeholder="Chercher" value="${esc(f.q || '')}" aria-label="Chercher">
      <select id="fStatut" aria-label="Statut"><option value="">Tous les statuts</option><option value="ouverts" ${f.statut === 'ouverts' ? 'selected' : ''}>Ouverts</option>${STATUTS.map(s => `<option ${f.statut === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <select id="fType" aria-label="Type"><option value="">Tous les types</option>${TYPES.map(s => `<option ${f.type === s ? 'selected' : ''}>${s}</option>`).join('')}<option value="fly" ${f.type === 'fly' ? 'selected' : ''}>⚡ Faites sur le fly</option><option value="interruption" ${f.type === 'interruption' ? 'selected' : ''}>🚨 Interruptions</option><option value="recurrentes" ${f.type === 'recurrentes' ? 'selected' : ''}>🔁 Récurrentes (occurrence en cours)</option></select>
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

/* ---------- Domaine hérité du projet ---------- */
// Le domaine d’une tâche liée à un projet est celui du projet (ou du premier projet parent qui en a un).
function domaineProjet(pid) {
  let p = pid && parId(S.projets, pid), n = 0;
  while (p && !p.domaine_id && p.parent_id && n++ < 10) p = parId(S.projets, p.parent_id);
  return p?.domaine_id || null;
}

/* ---------- Date avec heure facultative ---------- */
// Une date seule = journée entière (sans heure). Une date + heure = moment précis; l’heure de fin est facultative.
function planif(jour, debut, fin, jourFin) {
  if (!jour) return { planifie_debut: null, planifie_fin: null, journee_entiere: false };
  if (!debut) return { planifie_debut: minuitLocal(jour), planifie_fin: null, journee_entiere: true };
  return { planifie_debut: depuisLocal(`${jour}T${debut}`), planifie_fin: fin ? depuisLocal(`${jourFin || jour}T${fin}`) : null, journee_entiere: false };
}

/* ---------- Capture rapide ---------- */
// Titre, type, quand et projet d’abord. « Plus de détails » déplie le reste (domaine, périmètre, contexte, suivi,
// répétition, plan du jour) pour tout saisir d’un coup; l’état déplié est mémorisé sur l’appareil.
// Statut automatique : « À faire » si rien ne manque (domaine + projet ou hors projet), sinon « À traiter » (reste dans À trier).
const CLE_DETAILS = 'orbite-capture-details';
function ouvrirCapture() {
  let deplie = false; try { deplie = localStorage.getItem(CLE_DETAILS) === '1'; } catch { }
  const auj = aujourdhui();
  const nbPlan = S.actions.filter(a => a.plan_du_jour === auj && ouvert(a)).length;
  const d = dialogue(`<form>
    <div class="tete-d"><h2>Capture rapide</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
    <div class="corps">
      <label class="champ large"><span>Quoi?</span><input name="titre" class="titre-saisie" required autofocus autocomplete="off" placeholder="Un titre suffit"></label>
      <div class="types-rapides" role="radiogroup" aria-label="Type">${[...TYPES, 'Achat', 'Note'].map((t, i) => `<label><input type="radio" name="type" value="${t}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <div class="champ quand-capture" data-pour="action"><span>Quand (facultatif)</span><div class="date-heure"><input type="date" name="quand_jour" aria-label="Date"><input type="time" name="quand_heure" aria-label="Heure (facultative)" title="Heure (facultative)"></div>${L8.boutonsDate('quand_jour')}</div>
      <label class="champ"><span>Projet</span><select name="projet_id">${opts(S.projets.filter(p => p.statut === 'Actif'), null, { vide: 'Aucun pour l’instant', lib: 'titre' })}</select></label>
      <label class="champ" data-pour="tache"><span>Promis à (facultatif)</span><select name="promis_a_id">${opts(S.personnes, null, { vide: 'Personne' })}</select></label>
      <div class="champ cap-promis-pour" data-pour="tache"><span>Promis pour le</span><input type="date" name="promis_pour" aria-label="Promis pour le">${L8.boutonsDate('promis_pour')}</div>

      <details class="champ large details-capture" data-pour="action" ${deplie ? 'open' : ''}><summary>Plus de détails <span class="aide">domaine, périmètre, contexte, suivi, répétition</span></summary>
        <div class="corps-details">
          <fieldset><legend>Classement</legend>
            <label class="champ" data-pour="tache"><span>Statut</span><select name="statut"><option value="">Automatique</option>${optsTexte(STATUTS.filter(x => x !== 'Annulé'), '')}</select></label>
            <label class="champ cap-domaine"><span>Domaine</span><select name="domaine_id">${opts(S.domaines.filter(x => x.actif !== false), null)}</select></label>
            <p class="aide cap-domaine-herite champ large" hidden></p>
            <label class="champ case cap-hors-projet" data-pour="tache"><input type="checkbox" name="hors_projet"><span>Hors projet (volontairement)</span></label>
            <label class="champ" data-pour="tache"><span>Dans mon périmètre?</span><select name="dans_perimetre"><option value="">—</option><option value="true">Oui</option><option value="false">Non, je délègue</option></select></label>
            <label class="champ cap-delegue" data-pour="tache" hidden><span>Délégué à</span><select name="delegue_a_id">${opts(S.personnes, null)}</select></label>
            <p class="champ large cap-statut" aria-live="polite"></p>
          </fieldset>
          <fieldset><legend>Contexte et suivi</legend>
            <div class="champ large" data-pour="tache"><span>Contexte</span><div class="types-rapides">${CONTEXTES.map(c => `<label><input type="checkbox" name="contexte" value="${c}"><span>${c}</span></label>`).join('')}</div></div>
            <label class="champ" data-pour="tache"><span>En attente de</span><select name="en_attente_de_id">${opts(S.personnes, null)}</select></label>
            <label class="champ" data-pour="tache"><span>Relance</span><input type="date" name="relance"></label>
            <label class="champ"><span>Lieu ou lien</span><input name="lieu" autocomplete="off"></label>
            <label class="champ"><span>Référence externe</span><input name="reference_externe" autocomplete="off" placeholder="CANAC-123, billet…"></label>
            <label class="champ large"><span>Notes</span><textarea name="notes" rows="3"></textarea></label>
          </fieldset>
          ${champsRecurrence({})}
          <label class="champ case large cap-plan" data-pour="tache"><input type="checkbox" name="plan_du_jour" ${nbPlan >= 3 ? 'disabled' : ''}><span>Ajouter à « Aujourd’hui, je fais »${nbPlan >= 3 ? ' (déjà trois actions aujourd’hui)' : ` (${nbPlan}/3)`}</span></label>
        </div>
      </details>
    </div>
    <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Capturer</button></div>
  </form>`, async fd => {
    const projet = parId(S.projets, fd.get('projet_id'));
    const type = fd.get('type');
    if (type === 'Achat' || type === 'Note') {
      const [table, l] = type === 'Achat'
        ? ['achats', { item: fd.get('titre').trim(), statut: 'À compléter', projet_id: projet?.id || null }]
        : ['notes', { titre: fd.get('titre').trim(), type: 'Note', projet_id: projet?.id || null, domaine_id: projet?.domaine_id || null }];
      if (!navigator.onLine) { X.mettreEnFile(table, l); return; }
      const r = await sb.from(table).insert(l);
      if (r.error) { if (/fetch|network/i.test(r.error.message)) { X.mettreEnFile(table, l); return; } toast('Échec : ' + r.error.message); return false; }
      toast(type === 'Achat' ? 'Ajouté aux achats' : 'Note créée'); return rafraichir();
    }
    const { ligne, erreur } = ligneCapture(fd, projet);
    if (erreur) { toast(erreur); return false; }
    if (!navigator.onLine) { X.mettreEnFile('actions', ligne); return; }
    const { error } = await sb.from('actions').insert(ligne);
    if (error) { if (/fetch|network/i.test(error.message)) { X.mettreEnFile('actions', ligne); return; } toast('Échec : ' + error.message); return false; }
    const m = manquants(ligne);
    toast(ligne.type === 'Événement' ? 'Capturé' : m.length ? `Capturé · dans À trier (manque : ${m.join(', ')})` : `Capturé · ${ligne.statut}`);
    rafraichir();
  });
  brancherCapture(d);
  L7.brancherDictee(d);
}
// Construit la ligne à insérer à partir du formulaire de capture (détails facultatifs).
function ligneCapture(fd, projet) {
  const type = fd.get('type'), evt = type === 'Événement', tache = !evt;
  const vide = k => (fd.get(k) || '').trim() || null;
  const domProjet = domaineProjet(projet?.id);
  const ligne = { titre: fd.get('titre').trim(), type, ...planif(fd.get('quand_jour'), fd.get('quand_heure')), projet_id: projet?.id || null,
    domaine_id: domProjet || vide('domaine_id'), lieu: vide('lieu'), reference_externe: vide('reference_externe'), notes: vide('notes') };
  if (tache) {
    const perim = fd.get('dans_perimetre');
    Object.assign(ligne, { hors_projet: !projet && fd.get('hors_projet') === 'on', dans_perimetre: perim === '' || perim == null ? null : perim === 'true',
      delegue_a_id: perim === 'false' ? vide('delegue_a_id') : null, en_attente_de_id: vide('en_attente_de_id'), relance: vide('relance'), contexte: fd.getAll('contexte') });
    if (fd.get('plan_du_jour') === 'on') ligne.plan_du_jour = aujourdhui();
    // Promesse : à qui et pour quand (la date promise devient l’échéance).
    const promis = vide('promis_a_id');
    if (promis) {
      if (!L7.colonnePromis()) return { erreur: 'Promis à indisponible : exécute d’abord la migration SQL des engagements' };
      ligne.promis_a_id = promis;
      if (fd.get('promis_pour')) ligne.echeance = fd.get('promis_pour');
    }
  }
  // Statut : choisi, sinon automatique.
  const force = tache ? fd.get('statut') : '';
  ligne.statut = evt ? 'À faire' : force || (manquants({ ...ligne, statut: 'À traiter' }).length ? 'À traiter' : 'À faire');
  if (ligne.statut === 'Terminé') ligne.realisee_le = new Date().toISOString();
  const rec = lireRecurrence(fd, null);
  if (rec) {
    if (rec.type === 'semaine' && rec.base === 'calendrier' && !rec.jours.length) return { erreur: 'Répétition : coche au moins un jour' };
    if (!colonneRecurrence()) return { erreur: 'Répétition indisponible : exécute d’abord la migration SQL des tâches récurrentes' };
    ligne.recurrence = rec;
    if (!ligne.planifie_debut && !ligne.echeance) ligne.echeance = premiereOccurrence(rec);
  }
  return { ligne };
}
function brancherCapture(d) {
  const f = d.querySelector('form'), det = d.querySelector('.details-capture');
  det.addEventListener('toggle', () => { try { localStorage.setItem(CLE_DETAILS, det.open ? '1' : '0'); } catch { } });
  brancherRecurrence(d, {});
  const maj = () => {
    const fd = new FormData(f), type = fd.get('type'), action = !['Achat', 'Note'].includes(type), tache = action && type !== 'Événement';
    d.querySelectorAll('[data-pour="action"]').forEach(e => { e.hidden = !action; });
    d.querySelectorAll('[data-pour="tache"]').forEach(e => { e.hidden = !tache || (e.classList.contains('cap-delegue') && fd.get('dans_perimetre') !== 'false') || (e.classList.contains('cap-promis-pour') && !fd.get('promis_a_id')); });
    // Avec un projet : domaine hérité (mention) et « Hors projet » sans objet.
    const pid = fd.get('projet_id'), dom = domaineProjet(pid);
    d.querySelector('.cap-domaine').hidden = !!dom;
    const her = d.querySelector('.cap-domaine-herite'); her.hidden = !dom; her.textContent = dom ? `Domaine : ${parId(S.domaines, dom)?.nom || '—'} (selon le projet)` : '';
    d.querySelector('.cap-hors-projet').hidden = !tache || !!pid;
    // Aperçu du statut qui sera donné.
    const st = d.querySelector('.cap-statut');
    if (!tache) { st.textContent = ''; return; }
    const { ligne } = ligneCapture(fd, parId(S.projets, pid));
    if (!ligne) { st.textContent = ''; return; }
    const m = manquants({ ...ligne, statut: 'À traiter' });
    st.innerHTML = fd.get('statut') ? `Statut choisi : <b>${esc(fd.get('statut'))}</b>.`
      : m.length ? `Statut : <b>À traiter</b> (ira dans « À trier ») · manque : ${esc(m.join(', '))}.` : 'Statut : <b>À faire</b> · rien ne manque, elle ira directement dans le backlog.';
  };
  f.addEventListener('input', maj); f.addEventListener('change', maj); maj();
}

/* ---------- Fait sur le fly ---------- */
// Consigner après coup une tâche faite sans être planifiée : elle est créée déjà terminée, marquée « sur le fly ».
function ouvrirSurLeFly({ interruption = false } = {}) {
  const travail = S.domaines.find(d => d.nom === 'Travail');
  const domTravail = (S.reglages.find(r => r.cle === 'domaines_travail')?.valeur || [])[0] || travail?.id;
  const hors = L6.horsTravail();
  const domaines = S.domaines.filter(d => d.actif !== false).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99));
  const defaut = hors ? (S.domaines.find(d => d.nom === 'Personnel')?.id || '') : domTravail;
  const DUREES = [5, 15, 30, 60];
  const maintenant = versLocal(new Date().toISOString());
  const puces = (nom, valeurs) => `<div class="types-rapides" role="radiogroup">${valeurs.map(x => `<label><input type="radio" name="${nom}" value="${esc(x)}"><span>${esc(x)}</span></label>`).join('')}</div>`;
  const d = dialogue(`<form>
    <div class="tete-d"><h2 id="titreFly">⚡ Fait sur le fly</h2><div><button type="button" class="btn discret" id="histFly">Historique</button><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div></div>
    <div class="corps">
      <label class="champ large bascule-interruption"><input type="checkbox" name="interruption" ${interruption ? 'checked' : ''}><span>🚨 C’est une interruption (support opérationnel)</span></label>
      ${L7.htmlReprise()}
      <div class="champ large champ-issue"><span>Issue</span><div class="types-rapides" role="radiogroup" aria-label="Issue de l’interruption">
        <label><input type="radio" name="issue" value="regle" checked><span>Réglé maintenant</span></label>
        <label><input type="radio" name="issue" value="plus_tard"><span>À faire plus tard (je m’engage)</span></label></div></div>
      <label class="champ large"><span id="libTitreFly">Qu’as-tu fait?</span><input name="titre" class="titre-saisie" required autofocus autocomplete="off" placeholder="Ex. Débloqué une commande avec la réception"></label>
      <div class="champs-interruption">
        <div class="champ large"><span>Département</span>${puces('interruption_dept', DEPTS_INTERRUPTION)}</div>
        <div class="champ large"><span>Type de demande</span>${puces('interruption_type', TYPES_INTERRUPTION)}</div>
        <label class="champ large"><span>Demandé par (facultatif)</span><input name="demandeur" list="listeDemandeurs" autocomplete="off" placeholder="Ex. chef d’équipe expédition, soir">
          <datalist id="listeDemandeurs">${[...new Set([...S.personnes.map(p => p.nom), ...S.actions.map(a => a.demandeur)].filter(Boolean))].sort().map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
        <div class="champ large champ-promis-pour"><span>Promis pour le</span><div class="rangee-dates"><input type="date" name="promis_pour" aria-label="Date promise">
          <button type="button" class="btn discret" data-date="0">Aujourd’hui</button><button type="button" class="btn discret" data-date="1">Demain</button><button type="button" class="btn discret" data-date="ven">Vendredi</button></div>
          <p class="aide" style="margin:4px 0 0">Si le demandeur est dans ton répertoire, la promesse lui est reliée dans Engagements.</p></div>
      </div>
      <div class="champ large champ-duree"><span>Temps passé</span><div class="types-rapides" role="radiogroup" aria-label="Temps passé">${DUREES.map(d => `<label><input type="radio" name="duree" value="${d}" ${d === 15 ? 'checked' : ''}><span>${d < 60 ? d + ' min' : '1 h'}</span></label>`).join('')}<label><input type="radio" name="duree" value="autre"><span>Autre</span></label></div>
        <input type="number" name="duree_autre" min="1" step="1" placeholder="Minutes" class="duree-autre" aria-label="Autre durée en minutes"></div>
      <label class="champ domaine-fly"><span>Domaine</span><select name="domaine_id">${domaines.map(d => `<option value="${d.id}" ${d.id === defaut ? 'selected' : ''}>${esc(d.nom)}</option>`).join('')}</select></label>
      <label class="champ"><span>Projet (facultatif)</span><select name="projet_id">${opts(S.projets.filter(p => p.statut === 'Actif'), null, { vide: 'Hors projet', lib: 'titre' })}</select></label>
      <label class="champ champ-quand"><span>Terminé à</span><input type="datetime-local" name="quand" value="${esc(maintenant)}"></label>
      <label class="champ large"><span id="libNotesFly">Pour qui / notes (facultatif)</span><input name="notes" autocomplete="off" placeholder="Ex. demande de Rémi"></label>
    </div>
    <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Consigner</button></div>
  </form>`, async fd => {
    const projet = parId(S.projets, fd.get('projet_id'));
    const duree = fd.get('duree') === 'autre' ? (+fd.get('duree_autre') || null) : +fd.get('duree');
    const fin = depuisLocal(fd.get('quand')) || new Date().toISOString();
    const inter = fd.get('interruption') === 'on';
    if (inter && !fd.get('interruption_dept')) { toast('Choisis le département'); return false; }
    // « À faire plus tard » : la demande devient une tâche ouverte, promise au demandeur (pas encore faite, donc sans temps passé).
    const plusTard = inter && fd.get('issue') === 'plus_tard';
    const demandeur = inter ? ((fd.get('demandeur') || '').trim() || null) : null;
    const commun = { titre: fd.get('titre').trim(), type: 'Tâche', domaine_id: domaineProjet(projet?.id) || (inter ? domTravail : fd.get('domaine_id')) || null,
      projet_id: projet?.id || null, hors_projet: !projet, notes: (fd.get('notes') || '').trim() || null,
      interruption: inter, interruption_dept: inter ? fd.get('interruption_dept') : null,
      interruption_type: inter ? (fd.get('interruption_type') || null) : null, demandeur };
    const ligne = plusTard
      ? { ...commun, statut: 'À faire', echeance: fd.get('promis_pour') || null, ...(L7.colonnePromis() ? { promis_a_id: L7.personneParNom(demandeur)?.id || null } : {}) }
      : { ...commun, statut: 'Terminé', sur_le_fly: true, realisee_le: fin, duree_reelle_min: duree };
    // Où j’étais rendu : enregistré d’abord, pour ne rien perdre même si l’envoi de l’interruption est mis en file.
    const reprise = inter ? await L7.enregistrerReprise(fd) : null;
    if (!navigator.onLine) { X.mettreEnFile('actions', ligne); return; }
    const { error } = await sb.from('actions').insert(ligne);
    if (error) { if (/fetch|network/i.test(error.message)) { X.mettreEnFile('actions', ligne); return; } toast('Échec : ' + error.message); return false; }
    const quoi = !inter ? 'Consigné ⚡' : plusTard ? `Promesse notée 🤝${demandeur ? ' · ' + demandeur : ''}` : 'Interruption consignée 🚨';
    toast(reprise ? `${quoi} · Reprends : ${reprise.geste || reprise.a.titre}` : quoi); rafraichir();
  });
  // Mode interruption : champs dédiés, domaine Travail imposé.
  const caseInt = d.querySelector('[name=interruption]'), blocInt = d.querySelector('.champs-interruption');
  const blocRep = d.querySelector('.bloc-reprise'), champIssue = d.querySelector('.champ-issue');
  const modeInt = () => {
    const on = caseInt.checked;
    blocInt.hidden = !on; blocRep.hidden = !on; champIssue.hidden = !on;
    d.querySelector('#titreFly').textContent = on ? '🚨 Interruption' : '⚡ Fait sur le fly';
    d.querySelector('#libNotesFly').textContent = on ? 'Notes (facultatif)' : 'Pour qui / notes (facultatif)';
    d.querySelector('[name=titre]').placeholder = on ? 'Ex. Débloqué un TU en expédition' : 'Ex. Débloqué une commande avec la réception';
    d.querySelector('.domaine-fly').hidden = on || !!domaineProjet(d.querySelector('[name=projet_id]').value);
    majIssue();
  };
  // Issue : réglé maintenant (consigné comme fait) ou à faire plus tard (tâche ouverte promise au demandeur).
  function majIssue() {
    const plusTard = caseInt.checked && d.querySelector('[name=issue]:checked')?.value === 'plus_tard';
    d.querySelector('.champ-promis-pour').hidden = !plusTard;
    d.querySelector('.champ-duree').hidden = plusTard;
    d.querySelector('.champ-quand').hidden = plusTard;
    d.querySelector('#libTitreFly').textContent = plusTard ? 'Qu’est-ce qu’on te demande?' : 'Qu’as-tu fait?';
    if (caseInt.checked) d.querySelector('[name=titre]').placeholder = plusTard ? 'Ex. Sortir le rapport des retours pour l’expédition' : 'Ex. Débloqué un TU en expédition';
    d.querySelector('[type=submit]').textContent = plusTard ? 'Noter la promesse' : 'Consigner';
  }
  d.querySelectorAll('[name=issue]').forEach(r => r.onchange = majIssue);
  d.querySelectorAll('[data-date]').forEach(b => b.onclick = () => {
    const auj = aujourdhui(), k = b.dataset.date;
    const ven = () => { const j = new Date(auj + 'T12:00:00').getDay(); return plusJours(auj, j < 5 ? 5 - j : 12 - j); }; // le vendredi : celui de la semaine prochaine
    d.querySelector('[name=promis_pour]').value = k === 'ven' ? ven() : plusJours(auj, +k);
  });
  caseInt.onchange = modeInt;
  L7.brancherReprise(d);
  L7.brancherDictee(d);
  d.querySelector('#histFly').onclick = () => { d.close(); S.vue = 'actions'; S.filtres = { type: 'fly' }; history.replaceState(null, '', '#actions'); rendre(); window.scrollTo(0, 0); };
  const selPF = d.querySelector('[name=projet_id]'), champDF = d.querySelector('.domaine-fly');
  selPF.addEventListener('change', () => { champDF.hidden = caseInt.checked || !!domaineProjet(selPF.value); });
  modeInt();
  const champGeste = d.querySelector('[name=reprise_geste]');
  if (caseInt.checked && champGeste && !champGeste.closest('.champ').hidden) { champGeste.focus(); champGeste.select(); }
  const autre = d.querySelector('.duree-autre');
  autre.hidden = true;
  d.querySelectorAll('input[name=duree]').forEach(r => r.onchange = () => { autre.hidden = d.querySelector('input[name=duree]:checked').value !== 'autre'; if (!autre.hidden) autre.focus(); });
}

/* ---------- Tâches récurrentes ---------- */
// Une seule occurrence ouverte à la fois : quand elle passe à « Terminé », Supabase crée la suivante
// (déclencheur actions_recurrence, fonction prive.creer_occurrence_suivante). « Sauter » appelle sauter_occurrence().
// Les fonctions ci-dessous sont le miroir JavaScript de prive.recurrence_apres : elles servent à l’aperçu dans la fiche.
const JOURS_SEM = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MOIS_AN = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const RANGS = { 1: '1er', 2: '2e', 3: '3e', 4: '4e', '-1': 'dernier' };
const pad2 = n => String(n).padStart(2, '0');
const ajJ = (c, n) => { const d = new Date(c + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const isoDow = c => ((new Date(c + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1; // 1 = lundi … 7 = dimanche
const dernierDuMois = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const ajMois = (c, n) => { // comme un interval Postgres : le 31 janvier + 1 mois = le 28 (ou 29) février
  const [y, m, j] = c.split('-').map(Number), t = m - 1 + n, ny = y + Math.floor(t / 12), nm = ((t % 12) + 12) % 12 + 1;
  return `${ny}-${pad2(nm)}-${pad2(Math.min(j, dernierDuMois(ny, nm)))}`;
};
function recDansMois(r, y, m) {
  const dern = dernierDuMois(y, m), debut = `${y}-${pad2(m)}-01`;
  if (r.mode_mois === 'rang') {
    const js = +r.jour_semaine || 1, rg = +r.rang || 1;
    if (rg === -1) { const fin = `${y}-${pad2(m)}-${pad2(dern)}`; return ajJ(fin, -((isoDow(fin) - js + 7) % 7)); }
    let d = ajJ(debut, ((js - isoDow(debut) + 7) % 7) + 7 * (rg - 1));
    if (d.slice(5, 7) !== pad2(m)) d = ajJ(d, -7);
    return d;
  }
  const j = +r.jour_mois || 1;
  return `${y}-${pad2(m)}-${pad2(j === -1 || j > dern ? dern : j)}`;
}
function recApres(r, depuis) { // première date strictement après « depuis » selon la règle (base calendrier)
  const n = Math.max(+r.intervalle || 1, 1);
  if (r.type === 'jours') return ajJ(depuis, n);
  if (r.type === 'semaine') {
    const js = (r.jours?.length ? r.jours : [isoDow(depuis)]).map(Number).sort((a, b) => a - b), dow = isoDow(depuis);
    for (let i = 1; dow + i <= 7; i++) if (js.includes(dow + i)) return ajJ(depuis, i);
    return ajJ(ajJ(depuis, -(dow - 1)), 7 * n + js[0] - 1);
  }
  if (r.type === 'mois') {
    const y = +depuis.slice(0, 4), m = +depuis.slice(5, 7), d = recDansMois(r, y, m);
    if (d > depuis) return d;
    const t = ajMois(`${y}-${pad2(m)}-01`, n);
    return recDansMois(r, +t.slice(0, 4), +t.slice(5, 7));
  }
  if (r.type === 'annee') {
    const mo = +r.mois_annee || +depuis.slice(5, 7), j = +r.jour_mois || +depuis.slice(8, 10);
    let y = +depuis.slice(0, 4), d = null;
    for (let i = 0; i < 2; i++) { const dern = dernierDuMois(y, mo); d = `${y}-${pad2(mo)}-${pad2(j === -1 || j > dern ? dern : j)}`; if (d > depuis) return d; y += n; }
    return d;
  }
  return null;
}
// Date de la prochaine occurrence si celle-ci (datée « ref ») est terminée le jour « fait ». null = fin de la série.
function prochaineOccurrence(r, ref, fait = aujourdhui()) {
  const n = Math.max(+r.intervalle || 1, 1);
  if (r.fin_nombre && (+r.numero || 1) >= +r.fin_nombre) return null;
  let p;
  if (r.base === 'realisation') p = r.type === 'jours' ? ajJ(fait, n) : r.type === 'semaine' ? ajJ(fait, 7 * n) : ajMois(fait, r.type === 'mois' ? n : 12 * n);
  else { p = recApres(r, ref); const auj = aujourdhui(); for (let k = 0; p && p <= auj && k < 5000; k++) p = recApres(r, p); }
  if (!p || (r.fin_date && p > r.fin_date)) return null;
  return p;
}
// Première date d’une nouvelle série sans date : aujourd’hui si la règle tombe aujourd’hui, sinon la suivante.
const premiereOccurrence = r => r.base === 'realisation' ? aujourdhui() : recApres(r, ajJ(aujourdhui(), -1));
const jourAn = c => jourLong(c) + (c.slice(0, 4) !== aujourdhui().slice(0, 4) ? ' ' + c.slice(0, 4) : '');
const dateRef = a => a.echeance || (a.planifie_debut ? cleJour(a.planifie_debut) : null);
function libRecurrence(r, { court = false } = {}) {
  if (!r?.type) return '';
  const n = Math.max(+r.intervalle || 1, 1);
  const unite = { jours: ['jour', 'jours'], semaine: ['semaine', 'semaines'], mois: ['mois', 'mois'], annee: ['an', 'ans'] }[r.type];
  let t;
  if (r.base === 'realisation') t = `${n} ${unite[n > 1 ? 1 : 0]} après l’avoir faite`;
  else if (r.type === 'jours') t = n === 1 ? 'Chaque jour' : `Tous les ${n} jours`;
  else if (r.type === 'semaine') {
    const js = (r.jours || []).map(Number).sort((a, b) => a - b);
    const quels = js.join() === '1,2,3,4,5' ? 'du lundi au vendredi' : js.map(j => JOURS_SEM[j - 1]).join(', ');
    t = (n === 1 ? 'Chaque semaine' : `Toutes les ${n} semaines`) + (quels ? ` : ${quels}` : '');
  } else if (r.type === 'mois') {
    const quel = r.mode_mois === 'rang' ? `le ${RANGS[r.rang] || '1er'} ${JOURS_SEM[(+r.jour_semaine || 1) - 1]}` : +r.jour_mois === -1 ? 'le dernier jour' : `le ${+r.jour_mois === 1 ? '1er' : +r.jour_mois || 1}`;
    t = `${n === 1 ? 'Chaque mois' : `Tous les ${n} mois`}, ${quel}`;
  } else {
    const j = +r.jour_mois;
    t = `${n === 1 ? 'Chaque année' : `Tous les ${n} ans`}, le ${j === -1 ? 'dernier jour de' : j === 1 ? '1er' : j} ${MOIS_AN[(+r.mois_annee || 1) - 1]}`;
  }
  if (court) return t;
  if (r.fin_date) t += ` · jusqu’au ${jourDate(r.fin_date)}`;
  if (r.fin_nombre) t += ` · ${r.fin_nombre} fois (occurrence ${+r.numero || 1} de ${r.fin_nombre})`;
  return t;
}
const colonneRecurrence = () => !S.actions.length || 'recurrence' in S.actions[0];
// Après qu’une tâche récurrente est terminée ou sautée : annonce la date de la suivante.
function annoncerSuivante(id, debut) {
  const s = S.actions.find(x => x.recurrence_precedent_id === id);
  const d = s && dateRef(s);
  toast(s ? `${debut} · 🔁 prochaine : ${d ? jourDate(d) : 'créée'}` : `${debut} · fin de la série`);
}

function champsRecurrence(a) {
  const r = a.recurrence || {};
  const ref = dateRef(a) || aujourdhui();
  // Valeurs proposées par défaut à partir de la date de la tâche.
  const jDef = +ref.slice(8, 10), dowDef = isoDow(ref), rangDef = jDef > 28 ? -1 : Math.ceil(jDef / 7);
  const jours = r.jours?.length ? r.jours.map(Number) : [dowDef];
  const sel = (nom, options, val) => `<select name="${nom}">${options.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const joursDuMois = [...Array(31)].map((_, i) => [i + 1, i === 0 ? '1er' : String(i + 1)]).concat([[-1, 'dernier jour']]);
  const fin = r.fin_date ? 'date' : r.fin_nombre ? 'nombre' : '';
  return `<fieldset class="recurrence"><legend>🔁 Répétition</legend>
    <label class="champ"><span>Répéter</span>${sel('rec_type', [['', 'Jamais'], ['jours', 'Par jours'], ['semaine', 'Chaque semaine'], ['mois', 'Chaque mois'], ['annee', 'Chaque année']], r.type || '')}</label>
    <label class="champ rec-o"><span>Intervalle</span><div class="rec-ligne">Tous les <input type="number" name="rec_intervalle" min="1" max="999" step="1" value="${+r.intervalle || 1}" required> <span class="rec-unite"></span></div></label>
    <div class="champ large rec-o"><span>Date de la suivante</span><div class="types-rapides" role="radiogroup">
      <label><input type="radio" name="rec_base" value="calendrier" ${r.base !== 'realisation' ? 'checked' : ''}><span>Selon le calendrier</span></label>
      <label><input type="radio" name="rec_base" value="realisation" ${r.base === 'realisation' ? 'checked' : ''}><span>Après l’avoir faite</span></label></div>
      <p class="aide rec-aide-base"></p></div>
    <div class="champ large rec-semaine"><span>Quels jours</span><div class="types-rapides">${JOURS_SEM.map((j, i) => `<label><input type="checkbox" name="rec_jours" value="${i + 1}" ${jours.includes(i + 1) ? 'checked' : ''}><span>${j.slice(0, 3)}.</span></label>`).join('')}</div></div>
    <div class="champ large rec-mois"><span>Quel jour du mois</span>
      <label class="rec-ligne"><input type="radio" name="rec_mode_mois" value="jour" ${r.mode_mois !== 'rang' ? 'checked' : ''}> Le ${sel('rec_jour_mois', joursDuMois, r.type === 'mois' && r.mode_mois !== 'rang' ? r.jour_mois : jDef)} du mois</label>
      <label class="rec-ligne"><input type="radio" name="rec_mode_mois" value="rang" ${r.mode_mois === 'rang' ? 'checked' : ''}> Le ${sel('rec_rang', Object.entries(RANGS).sort((x, y) => (+x[0] === -1) - (+y[0] === -1) || x[0] - y[0]), r.rang ?? rangDef)} ${sel('rec_jour_semaine', JOURS_SEM.map((j, i) => [i + 1, j]), r.jour_semaine ?? dowDef)} du mois</label></div>
    <div class="champ large rec-annee"><span>Quel jour de l’année</span>
      <div class="rec-ligne">Le ${sel('rec_jour_an', joursDuMois, r.type === 'annee' ? r.jour_mois : jDef)} ${sel('rec_mois_annee', MOIS_AN.map((m, i) => [i + 1, m]), r.mois_annee ?? +ref.slice(5, 7))}</div></div>
    <div class="champ large rec-o"><span>Fin de la série</span><div class="rec-ligne">${sel('rec_fin', [['', 'Jamais'], ['date', 'Le'], ['nombre', 'Après']], fin)}
      <input type="date" name="rec_fin_date" value="${r.fin_date || ''}" aria-label="Date de fin"><span class="rec-nombre"><input type="number" name="rec_fin_nombre" min="1" step="1" value="${r.fin_nombre || ''}" aria-label="Nombre d’occurrences"> occurrences au total${r.numero > 1 ? ` (celle-ci est la ${r.numero}e)` : ''}</span></div></div>
    <p class="champ large rec-apercu" aria-live="polite"></p>
  </fieldset>`;
}
// Lit la règle saisie (null = pas de répétition). Garde le rang de l’occurrence dans la série.
function lireRecurrence(fd, ancienne) {
  const type = fd.get('rec_type'); if (!type) return null;
  const r = { type, intervalle: Math.max(+fd.get('rec_intervalle') || 1, 1), base: fd.get('rec_base') === 'realisation' ? 'realisation' : 'calendrier' };
  if (r.base === 'calendrier') {
    if (type === 'semaine') r.jours = fd.getAll('rec_jours').map(Number);
    if (type === 'mois') {
      r.mode_mois = fd.get('rec_mode_mois') === 'rang' ? 'rang' : 'jour';
      if (r.mode_mois === 'rang') { r.rang = +fd.get('rec_rang'); r.jour_semaine = +fd.get('rec_jour_semaine'); } else r.jour_mois = +fd.get('rec_jour_mois');
    }
    if (type === 'annee') { r.jour_mois = +fd.get('rec_jour_an'); r.mois_annee = +fd.get('rec_mois_annee'); }
  }
  if (fd.get('rec_fin') === 'date' && fd.get('rec_fin_date')) r.fin_date = fd.get('rec_fin_date');
  if (fd.get('rec_fin') === 'nombre' && +fd.get('rec_fin_nombre') > 0) r.fin_nombre = +fd.get('rec_fin_nombre');
  r.numero = +ancienne?.numero || 1;
  return r;
}
function brancherRecurrence(d, a) {
  const f = d.querySelector('form'), fs = d.querySelector('fieldset.recurrence'); if (!fs) return;
  const maj = () => {
    const fd = new FormData(f), r = lireRecurrence(fd, a.recurrence), type = fd.get('rec_type'), cal = fd.get('rec_base') !== 'realisation';
    fs.querySelectorAll('.rec-o').forEach(e => { e.hidden = !type; });
    fs.querySelector('.rec-semaine').hidden = !(type === 'semaine' && cal);
    fs.querySelector('.rec-mois').hidden = !(type === 'mois' && cal);
    fs.querySelector('.rec-annee').hidden = !(type === 'annee' && cal);
    const n = Math.max(+fd.get('rec_intervalle') || 1, 1);
    fs.querySelector('.rec-unite').textContent = type ? { jours: ['jour', 'jours'], semaine: ['semaine', 'semaines'], mois: ['mois', 'mois'], annee: ['an', 'ans'] }[type][n > 1 ? 1 : 0] : '';
    const finSel = fd.get('rec_fin');
    fs.querySelector('[name=rec_fin_date]').hidden = finSel !== 'date';
    fs.querySelector('.rec-nombre').hidden = finSel !== 'nombre';
    fs.querySelector('.rec-aide-base').textContent = cal
      ? 'Les dates suivent la règle, peu importe le jour où tu la fais. Une date manquée est sautée : la suivante est toujours dans le futur.'
      : 'L’intervalle part du jour où tu la termines (ex. changer un filtre 90 jours après l’avoir fait).';
    const ap = fs.querySelector('.rec-apercu');
    if (!r) { ap.textContent = ''; return; }
    if (r.type === 'semaine' && cal && !r.jours.length) { ap.innerHTML = '<span class="erreur">Coche au moins un jour.</span>'; return; }
    // Date de cette occurrence, telle que saisie dans la fiche.
    const ref = fd.get('echeance') || fd.get('jour') || fd.get('quand_jour') || null;
    const premiere = ref || premiereOccurrence(r);
    const suiv = prochaineOccurrence(r, premiere);
    ap.innerHTML = `<b>${esc(libRecurrence(r))}</b><br>`
      + (ref ? '' : `Aucune date : l’échéance sera fixée au <b>${esc(jourAn(premiere))}</b>.<br>`)
      + (suiv ? `Une fois celle-ci terminée${cal ? '' : ' aujourd’hui'}, la suivante sera créée pour le <b>${esc(jourAn(suiv))}</b>.` : 'Fin de la série : aucune autre occurrence ne sera créée après celle-ci.');
  };
  f.addEventListener('input', maj); f.addEventListener('change', maj); maj();
}

/* ---------- Fiche action ---------- */
function ouvrirAction(a) {
  const nouveau = !a.id;
  // Date et heures séparées : l’heure est facultative.
  const jourP = a.planifie_debut ? cleJour(a.planifie_debut) : '';
  const hDebut = a.planifie_debut && !a.journee_entiere ? versLocal(a.planifie_debut).slice(11, 16) : '';
  const jourFin = a.planifie_fin && !a.journee_entiere ? cleJour(a.planifie_fin) : '';
  const hFin = a.planifie_fin && !a.journee_entiere ? versLocal(a.planifie_fin).slice(11, 16) : '';
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
        <div class="champ"><span>Planifié le</span><input type="date" name="jour" value="${jourP}" aria-label="Planifié le">${L8.boutonsDate('jour')}</div>
        <label class="champ"><span>Priorité</span><select name="priorite"><option value="">—</option>${Object.entries(PRIOS).map(([k, l]) => `<option value="${k}" ${String(a.priorite) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="champ"><span>Heure de début (facultatif)</span><input type="time" name="heure_debut" value="${hDebut}"></label>
        <label class="champ"><span>Heure de fin (facultatif)</span><input type="time" name="heure_fin" value="${hFin}"></label>
        ${jourFin && jourFin !== jourP ? `<label class="champ"><span>Fin le</span><input type="date" name="jour_fin" value="${jourFin}"></label>` : ''}
        <div class="champ"><span>Échéance</span><input type="date" name="echeance" value="${a.echeance || ''}" aria-label="Échéance">${L8.boutonsDate('echeance')}</div>
        <label class="champ"><span>Relance</span><input type="date" name="relance" value="${a.relance || ''}"></label>
        <label class="champ"><span>Durée prévue (min)</span><input type="number" min="0" step="1" name="duree_min" value="${a.duree_min ?? ''}"></label>
        <label class="champ"><span>Durée réelle (min)</span><input type="number" min="0" step="1" name="duree_reelle_min" value="${a.duree_reelle_min ?? ''}"></label>
      </fieldset>

      ${a.uid_externe ? '' : champsRecurrence(a)}

      <fieldset><legend>Relier</legend>
        <label class="champ"><span>Projet</span><select name="projet_id">${opts(S.projets, a.projet_id, { lib: 'titre' })}</select></label>
        <label class="champ domaine-tache"><span>Domaine</span><select name="domaine_id">${opts(S.domaines, a.domaine_id)}</select></label>
        <p class="aide domaine-herite" hidden></p>
        <label class="champ case"><input type="checkbox" name="hors_projet" ${a.hors_projet ? 'checked' : ''}><span>Hors projet (volontairement)</span></label>
        <label class="champ"><span>Dans mon périmètre?</span><select name="dans_perimetre"><option value="">—</option><option value="true" ${a.dans_perimetre === true ? 'selected' : ''}>Oui</option><option value="false" ${a.dans_perimetre === false || (a.dans_perimetre == null && a.delegue_a_id) ? 'selected' : ''}>Non, je délègue</option></select></label>
        <label class="champ champ-delegue"><span>Délégué à</span><select name="delegue_a_id">${opts(S.personnes, a.delegue_a_id)}</select></label>
        <label class="champ"><span>En attente de</span><select name="en_attente_de_id">${opts(S.personnes, a.en_attente_de_id)}</select></label>
        <label class="champ"><span>Promis à</span><select name="promis_a_id">${opts(S.personnes, a.promis_a_id)}</select></label>
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
      ${nouveau ? '' : `<div class="champ large notes-liees">${M.blocNotesLiees({ action_id: a.id })}</div>`}
    </div>
    <div class="pied">
      ${nouveau ? '' : '<button type="button" class="btn danger gauche" id="suppr">Supprimer</button>'}
      ${!nouveau && a.type === 'Événement' ? `<button type="button" class="btn" id="cr">${L.noteDe(a) ? 'Ouvrir le compte rendu' : 'Compte rendu'}</button>` : ''}
      ${a.note_id && parId(S.notes, a.note_id) ? '<button type="button" class="btn discret" id="voirNote">Note d’origine</button>' : ''}
      ${!nouveau && a.recurrence && ouvert(a) ? '<button type="button" class="btn" id="sauter" title="Passer à l’occurrence suivante sans marquer celle-ci comme faite">Sauter cette fois</button>' : ''}
      <button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button>
    </div></form>`, async fd => {
    const vide = k => (fd.get(k) || '').trim() || null;
    const p = planif(fd.get('jour'), fd.get('heure_debut'), fd.get('heure_fin'), fd.get('jour_fin'));
    const ligne = {
      titre: fd.get('titre').trim(), statut: fd.get('statut'), type: fd.get('type'), prochain_geste: vide('prochain_geste'),
      ...p,
      echeance: vide('echeance'), relance: vide('relance'), priorite: fd.get('priorite') ? +fd.get('priorite') : null,
      duree_min: fd.get('duree_min') ? +fd.get('duree_min') : null,
      duree_reelle_min: fd.get('duree_reelle_min') ? +fd.get('duree_reelle_min') : null,
      projet_id: vide('projet_id'), domaine_id: domaineProjet(vide('projet_id')) || vide('domaine_id'), hors_projet: fd.get('hors_projet') === 'on',
      dans_perimetre: fd.get('dans_perimetre') === '' ? null : fd.get('dans_perimetre') === 'true',
      delegue_a_id: fd.get('dans_perimetre') === 'false' ? vide('delegue_a_id') : null, en_attente_de_id: vide('en_attente_de_id'), motif_blocage: vide('motif_blocage'),
      contexte: fd.getAll('contexte'), lieu: vide('lieu'), reference_externe: vide('reference_externe'), notes: vide('notes'),
      demande_recue_le: vide('demande_recue_le'), emplacement: vide('emplacement'), departement: vide('departement'),
      compagnie: vide('compagnie'), probleme_signale: vide('probleme_signale'), travaux_realises: vide('travaux_realises'),
    };
    // Promis à : colonne créée par la migration des engagements.
    if (L7.colonnePromis()) ligne.promis_a_id = vide('promis_a_id');
    else if (vide('promis_a_id')) { toast('Promis à indisponible : exécute d’abord la migration SQL des engagements'); return false; }
    if (ligne.statut !== 'Terminé') ligne.realisee_le = null;
    else if (a.statut !== 'Terminé') ligne.realisee_le = a.realisee_le || new Date().toISOString();
    // Répétition : la règle voyage avec chaque occurrence (colonne recurrence, créée par la migration SQL).
    if (!a.uid_externe) {
      const rec = lireRecurrence(fd, a.recurrence);
      if (rec && rec.type === 'semaine' && rec.base === 'calendrier' && !rec.jours.length) { toast('Répétition : coche au moins un jour'); return false; }
      if (colonneRecurrence()) ligne.recurrence = rec;
      else if (rec) { toast('Répétition indisponible : exécute d’abord la migration SQL des tâches récurrentes'); return false; }
      if (rec && !ligne.echeance && !ligne.planifie_debut) ligne.echeance = premiereOccurrence(rec);
    }
    const { data: enr, error } = nouveau ? await sb.from('actions').insert(ligne).select('id').single() : await sb.from('actions').update(ligne).eq('id', a.id).select('id').single();
    if (error) { toast('Échec : ' + error.message); return false; }
    await rafraichir();
    if (ligne.recurrence && ligne.statut === 'Terminé' && a.statut !== 'Terminé') annoncerSuivante(enr.id, 'Terminé');
    else toast(nouveau ? 'Action ajoutée' : 'Enregistré');
  });
  brancherRecurrence(d, a);
  const sa = d.querySelector('#sauter');
  if (sa) sa.onclick = async () => {
    sa.disabled = true;
    const { error } = await sb.rpc('sauter_occurrence', { p_id: a.id });
    if (error) { sa.disabled = false; return toast('Échec : ' + error.message); }
    d.close(); await rafraichir(); annoncerSuivante(a.id, 'Sautée');
  };
  // Avec un projet, le domaine vient du projet : le champ est masqué et remplacé par une mention.
  const selP = d.querySelector('[name=projet_id]'), champD = d.querySelector('.domaine-tache'), mention = d.querySelector('.domaine-herite');
  const majDomaine = () => {
    const dom = domaineProjet(selP.value), nomD = dom && parId(S.domaines, dom)?.nom;
    champD.hidden = !!dom; mention.hidden = !dom;
    if (dom) { mention.textContent = `Domaine : ${nomD} (selon le projet)`; d.querySelector('[name=domaine_id]').value = dom; }
  };
  selP.addEventListener('change', majDomaine); majDomaine();
  // « Délégué à » n’apparaît que si l’action n’est pas dans mon périmètre (sinon la valeur est effacée à l’enregistrement).
  const selPer = d.querySelector('[name=dans_perimetre]'), champDel = d.querySelector('.champ-delegue');
  const majDelegue = () => { champDel.hidden = selPer.value !== 'false'; };
  selPer.addEventListener('change', majDelegue); majDelegue();
  // Sans date, les heures n’ont pas de sens : on les désactive.
  const jIn = d.querySelector('[name=jour]'), hIns = d.querySelectorAll('[name=heure_debut], [name=heure_fin]');
  const majHeures = () => hIns.forEach(h => { h.disabled = !jIn.value; });
  jIn.addEventListener('input', majHeures); majHeures();
  const cr = d.querySelector('#cr'); if (cr) cr.onclick = () => { d.close(); L.compteRendu(a); };
  const vn = d.querySelector('#voirNote'); if (vn) vn.onclick = () => { d.close(); M.ficheNote(parId(S.notes, a.note_id)); };
  const nl = d.querySelector('.notes-liees'); if (nl) M.brancherNotesLiees(nl, { action_id: a.id, projet_id: a.projet_id || null, domaine_id: a.domaine_id || null, titre: a.titre, avant: () => d.close() });
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
      <label class="champ"><span>Domaine</span><select name="domaine_id" required>${opts(S.domaines, p.domaine_id)}</select></label>
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
  try { await charger(); M.synchroTheme(); rendre(); X.viderFile(); if (h !== 'fermer') setTimeout(() => M.proposerRevue(), 600); if (h === 'fermer') { history.replaceState(null, '', location.pathname); L6.ouvrirFermeture(); } } catch (e) { $('#app').innerHTML = `<div class="connexion"><p class="erreur">Impossible de charger les données : ${esc(e.message)}</p></div>`; }
}

M = installerModules({ sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, jourLong, cleJour, fmtHeure, versLocal, depuisLocal,
  dialogue, rafraichir, rendre: () => rendre(), liste, ouvert, enRetard, manquants, carteProjet, ouvrirPersonne, ouvrirAction, MODULES, ico, blocBienEtre: () => L6.blocInterruptions() + L7.blocRevue() + L6.blocRevue(),
  conflitDe: t => L.conflitDe(t), agendaDe: t => L.agendaDe(t), moiTransport: () => L.moi(), encartPneus: () => L.encartPneus(), creerActionsDepuisNote: (n, txt) => L.creerActionsDepuisNote(n, txt), SUPA_URL: SUPABASE_URL });

L = installerLot5({ sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, jourLong, cleJour, fmtHeure, dialogue, rafraichir, ouvert,
  rendre: () => rendre(), ouvrirAction, ouvrirPersonne, ficheNote: n => M.ficheNote(n), ficheAchat: a => M.ficheAchat(a), meteo: () => METEO.donnees,
  personneParNom: n => L7.personneParNom(n), colonnePromis: () => L7.colonnePromis() });

X = installerExtras({ sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, dialogue, rafraichir, liste, ouvert, COULEURS_CAL,
  visible: a => L6.visible(a), boutonPlacer: () => L6.boutonPlacer() });

L6 = installerLot6({ sb, S, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, fmtHeure, dialogue, rafraichir, rendre: () => rendre(), ouvert, depuisLocal,
  charge: () => L.chargeDuJour(), minutesLocales: d => L.minutesLocales(d) });

L7 = installerLot7({ sb, S, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, rafraichir, rendre: () => rendre(), liste, ouvert, enRetard,
  ouvrirAction, ficheNote: n => M.ficheNote(n), visible: a => L6.visible(a) });

L8 = installerLot8({ sb, S, esc, toast, parId, aujourdhui, plusJours, rafraichir, rendre: () => rendre(), carteProjet, sante, STATUTS_PROJET, PRIOS });
window.addEventListener('hashchange', () => {
  if (!S.session) return;
  if (location.hash === '#fermer') { history.replaceState(null, '', location.pathname); L6.ouvrirFermeture(); return; }
  // Lien de notification (#revue, #agenda…) alors que l’app est déjà ouverte : on affiche ce module.
  const k = location.hash.slice(1);
  if (MODULES.some(m => m.k === k) && S.vue !== k) { S.vue = k; S.filtres = {}; S.reorg = false; rendre(); window.scrollTo(0, 0); }
});

let derniereSession;
sb.auth.onAuthStateChange((evt, session) => {
  const id = session?.user?.id || null;
  if (id === derniereSession && evt !== 'SIGNED_OUT') return;
  derniereSession = id;
  demarrer(session);
});

document.addEventListener('keydown', e => {
  if (S.session && ((e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)))) { e.preventDefault(); return L.ouvrirRecherche(); }
  if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey && S.session && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); ouvrirSurLeFly(); }
  if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey && S.session && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); ouvrirSurLeFly({ interruption: true }); }
  if (e.key.toLowerCase() === 'n' && S.session && !document.querySelector('dialog[open]') && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); ouvrirCapture(); }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.session && !document.querySelector('dialog[open]')) rafraichir().then(() => M.proposerRevue()).catch(() => {}); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
