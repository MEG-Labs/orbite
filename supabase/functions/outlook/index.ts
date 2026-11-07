// Importe les calendriers publiés (liens iCal d'Outlook, de Google Agenda, etc.) dans ORBITE, en événements.
// Les liens se règlent dans ORBITE > Réglages (réglage « calendriers_ics »). Fenêtre : 14 jours passés à 120 jours à venir.
import { admin, autorise, reglage, cors, json, cleJour, plusJours, depuisLocal, FUSEAU } from './commun.ts';

const WINDOWS_TZ: Record<string, string> = {
  'Eastern Standard Time': 'America/Toronto', 'Central Standard Time': 'America/Chicago', 'Mountain Standard Time': 'America/Edmonton',
  'Pacific Standard Time': 'America/Vancouver', 'Atlantic Standard Time': 'America/Halifax', 'UTC': 'UTC', 'GMT Standard Time': 'Europe/London',
  'Romance Standard Time': 'Europe/Paris', 'W. Europe Standard Time': 'Europe/Berlin',
};
const zone = (tzid?: string) => { if (!tzid) return FUSEAU; const t = tzid.replace(/^"|"$/g, ''); if (WINDOWS_TZ[t]) return WINDOWS_TZ[t]; try { new Intl.DateTimeFormat('en', { timeZone: t }); return t; } catch { return FUSEAU; } };
const texte = (s = '') => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

type Ev = { uid: string; titre: string; debut: Date; fin?: Date; jour: boolean; lieu?: string; rrule?: string; exdates: number[]; recurrenceId?: number; statut?: string };

function lireDate(val: string, params: Record<string, string>): { d: Date; jour: boolean } {
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(val)) { const y = +val.slice(0, 4), m = +val.slice(4, 6), d = +val.slice(6, 8); return { d: depuisLocal(y, m, d), jour: true }; }
  const y = +val.slice(0, 4), m = +val.slice(4, 6), d = +val.slice(6, 8), h = +val.slice(9, 11), mi = +val.slice(11, 13), s = +val.slice(13, 15) || 0;
  if (val.endsWith('Z')) return { d: new Date(Date.UTC(y, m - 1, d, h, mi, s)), jour: false };
  return { d: depuisLocal(y, m, d, h, mi, s, zone(params.TZID)), jour: false };
}
function analyser(ics: string): Ev[] {
  const lignes = ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const evs: Ev[] = []; let e: Partial<Ev> | null = null;
  for (const l of lignes) {
    if (l === 'BEGIN:VEVENT') { e = { exdates: [] }; continue; }
    if (l === 'END:VEVENT') { if (e?.uid && e.debut) evs.push(e as Ev); e = null; continue; }
    if (!e) continue;
    const i = l.indexOf(':'); if (i < 0) continue;
    const [nom, ...ps] = l.slice(0, i).split(';'); const val = l.slice(i + 1);
    const params = Object.fromEntries(ps.map(p => p.split('=')));
    if (nom === 'UID') e.uid = val;
    else if (nom === 'SUMMARY') e.titre = texte(val);
    else if (nom === 'LOCATION') e.lieu = texte(val);
    else if (nom === 'STATUS') e.statut = val;
    else if (nom === 'RRULE') e.rrule = val;
    else if (nom === 'DTSTART') { const r = lireDate(val, params); e.debut = r.d; e.jour = r.jour; }
    else if (nom === 'DTEND') e.fin = lireDate(val, params).d;
    else if (nom === 'EXDATE') val.split(',').forEach(v => e!.exdates!.push(lireDate(v, params).d.getTime()));
    else if (nom === 'RECURRENCE-ID') e.recurrenceId = lireDate(val, params).d.getTime();
  }
  return evs;
}
const JOURS: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
// Parcourt les jours en heure locale (Toronto) pour garder la même heure de part et d'autre du changement d'heure.
function partiesLocales(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}
// Le n-ième jour de semaine du mois (n négatif : depuis la fin), pour BYDAY=2TU ou -1FR.
function nieme(y: number, m: number, dow: number, n: number) {
  if (n > 0) { const premier = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); const j = 1 + ((dow - premier + 7) % 7) + (n - 1) * 7; return j; }
  const dernier = new Date(Date.UTC(y, m, 0)); const j = dernier.getUTCDate() - ((dernier.getUTCDay() - dow + 7) % 7) + (n + 1) * 7; return j;
}
function occurrences(e: Ev, de: number, a: number): Date[] {
  if (!e.rrule) return [e.debut];
  const r = Object.fromEntries(e.rrule.split(';').map(x => x.split('=')));
  const freq = r.FREQ, inter = +(r.INTERVAL || 1), max = r.COUNT ? +r.COUNT : 100000;
  const fin = r.UNTIL ? lireDate(r.UNTIL, {}).d.getTime() + (/^\d{8}$/.test(r.UNTIL) ? 864e5 - 1 : 0) : Infinity;
  const parJour = r.BYDAY ? r.BYDAY.split(',').map((j: string) => ({ dow: JOURS[j.slice(-2)], n: j.length > 2 ? +j.slice(0, -2) : 0 })) : null;
  const joursMois = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
  const mois = r.BYMONTH ? r.BYMONTH.split(',').map(Number) : null;
  const L = partiesLocales(e.debut);
  const base = Date.UTC(L.y, L.m - 1, L.d), dowBase = new Date(base).getUTCDay();
  const out: Date[] = []; let n = 0;
  // Sans COUNT, on saute directement près de la fenêtre (les vieux événements récurrents remontent à des années).
  const k0 = r.COUNT ? 0 : Math.max(0, Math.floor((de - base) / 864e5) - 2);
  for (let k = k0; k < k0 + 40000; k++) {
    const jour = new Date(base + k * 864e5); // date locale représentée en UTC
    if (jour.getTime() > Math.min(a, fin) + 2 * 864e5 || n >= max) break;
    const y = jour.getUTCFullYear(), m = jour.getUTCMonth() + 1, d = jour.getUTCDate(), dow = jour.getUTCDay();
    const ecartMois = (y - L.y) * 12 + m - L.m;
    const dernierJour = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const jourMoisOk = () => joursMois ? joursMois.some(x => x === d || (x < 0 && dernierJour + x + 1 === d)) : null;
    const jourSemOk = (avecRang: boolean) => parJour ? parJour.some(p => p.dow === dow && (!avecRang || !p.n || nieme(y, m, p.dow, p.n) === d)) : null;
    let ok = false;
    if (mois && !mois.includes(m)) ok = false;
    else if (freq === 'DAILY') ok = k % inter === 0 && (jourSemOk(false) ?? true);
    else if (freq === 'WEEKLY') ok = Math.floor((k + (dowBase + 6) % 7) / 7) % inter === 0 && (jourSemOk(false) ?? dow === dowBase);
    else if (freq === 'MONTHLY') ok = ecartMois % inter === 0 && (jourMoisOk() ?? jourSemOk(true) ?? d === L.d);
    else if (freq === 'YEARLY') ok = (y - L.y) % inter === 0 && (mois ? (jourMoisOk() ?? jourSemOk(true) ?? d === L.d) : m === L.m && (jourSemOk(true) ?? d === L.d));
    if (!ok) continue;
    const t = e.jour ? depuisLocal(y, m, d) : depuisLocal(y, m, d, L.h, L.mi, L.s);
    if (t.getTime() > fin) break;
    n++;
    if (t.getTime() >= de && t.getTime() <= a && !e.exdates.includes(t.getTime())) out.push(t);
  }
  return out;
}

type Cal = { id: string; nom: string; lien: string };

function lignesDe(cal: Cal, evs: Ev[], de: number, a: number) {
  const remplaces = new Set(evs.filter(e => e.recurrenceId).map(e => `${e.uid}|${e.recurrenceId}`));
  const lignes: Record<string, unknown>[] = [];
  for (const e of evs) {
    const duree = e.fin ? e.fin.getTime() - e.debut.getTime() : 0;
    for (const d of e.recurrenceId ? [e.debut] : occurrences(e, de, a)) {
      if (d.getTime() < de || d.getTime() > a) continue;
      if (!e.recurrenceId && remplaces.has(`${e.uid}|${d.getTime()}`)) continue;
      lignes.push({ uid_externe: `${cal.id}|${e.uid}|${d.toISOString()}`, source_externe: cal.nom, titre: e.titre || '(sans titre)', type: 'Événement',
        statut: e.statut === 'CANCELLED' ? 'Annulé' : 'À faire', planifie_debut: d.toISOString(),
        planifie_fin: duree && !e.jour ? new Date(d.getTime() + duree).toISOString() : null, journee_entiere: e.jour, lieu: e.lieu || null, hors_projet: true });
    }
  }
  return lignes;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  if (!await autorise(req, sb)) return json({ erreur: 'non autorisé' }, 401);
  const cals = ((await reglage(sb, 'calendriers_ics')) || []) as Cal[];
  const auj = cleJour(new Date());
  const de = new Date(plusJours(auj, -14) + 'T00:00:00Z').getTime(), a = new Date(plusJours(auj, 120) + 'T23:59:59Z').getTime();
  const maintenant = Date.now();
  const { data: existantsTous, error: e0 } = await sb.from('actions').select('id,uid_externe,statut,planifie_debut,planifie_fin,titre,journee_entiere,lieu,source_externe').not('uid_externe', 'is', null);
  if (e0) return json({ erreur: e0.message }, 500);
  // Calendrier retiré des réglages : ses événements importés sont retirés aussi.
  const ids = new Set(cals.map(c => c.id));
  const orphelins = (existantsTous || []).filter(x => !ids.has(x.uid_externe.split('|')[0])).map(x => x.id);
  for (let i = 0; i < orphelins.length; i += 200) await sb.from('actions').delete().in('id', orphelins.slice(i, i + 200));
  const rapport: Record<string, unknown>[] = [];
  for (const cal of cals) {
    try {
      const r = await fetch(String(cal.lien).replace(/^webcal:/, 'https:'));
      if (!r.ok) { rapport.push({ nom: cal.nom, erreur: `HTTP ${r.status}` }); continue; }
      const corps = await r.text();
      if (!corps.includes('BEGIN:VCALENDAR')) { rapport.push({ nom: cal.nom, erreur: 'Ce lien ne renvoie pas un calendrier iCal' }); continue; }
      const vus = new Set<string>();
      const lignes = lignesDe(cal, analyser(corps), de, a).filter(l => !vus.has(l.uid_externe as string) && !!vus.add(l.uid_externe as string));
      // Synchronise la fenêtre importée sans écraser ce que tu as changé dans ORBITE (statut, projet, notes).
      lignes.forEach(l => { const fin = new Date((l.planifie_fin || l.planifie_debut) as string).getTime(); if (l.statut !== 'Annulé' && fin < maintenant) l.statut = 'Terminé'; });
      const uids = new Set(lignes.map(l => l.uid_externe as string));
      const existants = (existantsTous || []).filter(x => x.uid_externe.startsWith(cal.id + '|') && new Date(x.planifie_debut).getTime() >= de);
      const parUid = new Map(existants.map(x => [x.uid_externe, x]));
      const disparus = existants.filter(x => !uids.has(x.uid_externe) && new Date(x.planifie_debut).getTime() > maintenant).map(x => x.id);
      for (let i = 0; i < disparus.length; i += 200) await sb.from('actions').delete().in('id', disparus.slice(i, i + 200));
      let nouveaux = lignes.filter(l => !parUid.has(l.uid_externe as string));
      // Un événement déjà saisi dans ORBITE (même titre, même début) est relié au calendrier au lieu d'être dédoublé.
      if (nouveaux.length) {
        const { data: manuels } = await sb.from('actions').select('id,titre,planifie_debut').is('uid_externe', null).eq('type', 'Événement').gte('planifie_debut', new Date(de).toISOString());
        const cle = (t: unknown, d: unknown) => `${String(t).trim().toLowerCase()}|${new Date(d as string).getTime()}`;
        const parCle = new Map((manuels || []).map(m => [cle(m.titre, m.planifie_debut), m.id]));
        const relies: Record<string, unknown>[] = [];
        nouveaux = nouveaux.filter(l => { const id = parCle.get(cle(l.titre, l.planifie_debut)); if (!id) return true; parCle.delete(cle(l.titre, l.planifie_debut)); relies.push({ id, l }); return false; });
        for (const { id, l } of relies as { id: string; l: Record<string, unknown> }[]) await sb.from('actions').update({ uid_externe: l.uid_externe, source_externe: l.source_externe, planifie_fin: l.planifie_fin, lieu: l.lieu }).eq('id', id);
      }
      for (let i = 0; i < nouveaux.length; i += 200) {
        const { error } = await sb.from('actions').insert(nouveaux.slice(i, i + 200));
        if (error) throw new Error(error.message);
      }
      for (const l of lignes.filter(l => parUid.has(l.uid_externe as string))) {
        const ex = parUid.get(l.uid_externe as string)!;
        const maj: Record<string, unknown> = { titre: l.titre, planifie_debut: l.planifie_debut, planifie_fin: l.planifie_fin, journee_entiere: l.journee_entiere, lieu: l.lieu, source_externe: l.source_externe };
        if (l.statut === 'Annulé' || (l.statut === 'Terminé' && ex.statut === 'À faire')) maj.statut = l.statut;
        const memeDate = (x: unknown, y: unknown) => (x == null && y == null) || (x != null && y != null && new Date(x as string).getTime() === new Date(y as string).getTime());
        const change = Object.entries(maj).some(([k, v]) => k.startsWith('planifie_') ? !memeDate(v, (ex as Record<string, unknown>)[k]) : (v ?? null) !== ((ex as Record<string, unknown>)[k] ?? null));
        if (change) await sb.from('actions').update(maj).eq('id', ex.id);
      }
      rapport.push({ nom: cal.nom, evenements: lignes.length, nouveaux: nouveaux.length, retires: disparus.length });
    } catch (er) { rapport.push({ nom: cal.nom, erreur: (er as Error).message }); }
  }
  const evenements = rapport.reduce((t, x) => t + ((x.evenements as number) || 0), 0);
  const erreurs = rapport.filter(x => x.erreur);
  return json({ actif: cals.length > 0, evenements, calendriers: rapport, orphelins: orphelins.length, erreur: erreurs.length && erreurs.length === cals.length ? erreurs.map(x => `${x.nom} : ${x.erreur}`).join(' · ') : undefined });
});
