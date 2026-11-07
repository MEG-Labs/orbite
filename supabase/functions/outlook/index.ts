// Importe un calendrier publié (lien .ics d'Outlook) dans ORBITE, en événements « Agenda externe ».
// Le lien se règle dans ORBITE > Réglages. Fenêtre : 14 jours passés à 120 jours à venir.
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
function occurrences(e: Ev, de: number, a: number): Date[] {
  if (!e.rrule) return [e.debut];
  const r = Object.fromEntries(e.rrule.split(';').map(x => x.split('=')));
  const freq = r.FREQ, inter = +(r.INTERVAL || 1), max = r.COUNT ? +r.COUNT : 1000;
  const fin = r.UNTIL ? lireDate(r.UNTIL, {}).d.getTime() : Infinity;
  const jours = r.BYDAY ? r.BYDAY.split(',').map((j: string) => JOURS[j.slice(-2)]) : null;
  const L = partiesLocales(e.debut);
  const base = Date.UTC(L.y, L.m - 1, L.d);
  const out: Date[] = []; let n = 0;
  for (let k = 0; k < 4000; k++) {
    const jour = new Date(base + k * 864e5); // date locale représentée en UTC
    const t = e.jour ? depuisLocal(jour.getUTCFullYear(), jour.getUTCMonth() + 1, jour.getUTCDate()) : depuisLocal(jour.getUTCFullYear(), jour.getUTCMonth() + 1, jour.getUTCDate(), L.h, L.mi, L.s);
    if (t.getTime() > Math.min(a, fin) || n >= max) break;
    const dow = jour.getUTCDay();
    let ok = false;
    if (freq === 'DAILY') ok = k % inter === 0;
    else if (freq === 'WEEKLY') ok = Math.floor((k + ((new Date(base).getUTCDay() + 6) % 7)) / 7) % inter === 0 && (jours ? jours.includes(dow) : dow === new Date(base).getUTCDay());
    else if (freq === 'MONTHLY') ok = jour.getUTCDate() === L.d && ((jour.getUTCFullYear() - L.y) * 12 + jour.getUTCMonth() + 1 - L.m) % inter === 0;
    else if (freq === 'YEARLY') ok = jour.getUTCDate() === L.d && jour.getUTCMonth() + 1 === L.m;
    if (!ok) continue;
    n++;
    if (t.getTime() >= de && !e.exdates.includes(t.getTime())) out.push(t);
  }
  return out;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  if (!await autorise(req, sb)) return json({ erreur: 'non autorisé' }, 401);
  const lien = await reglage(sb, 'outlook_ics');
  if (!lien) return json({ actif: false, raison: 'Aucun lien de calendrier réglé' });
  const r = await fetch(String(lien).replace(/^webcal:/, 'https:'));
  if (!r.ok) return json({ erreur: `Calendrier ${r.status}` }, 502);
  const evs = analyser(await r.text());
  const auj = cleJour(new Date());
  const de = new Date(plusJours(auj, -14) + 'T00:00:00Z').getTime(), a = new Date(plusJours(auj, 120) + 'T23:59:59Z').getTime();
  const remplaces = new Set(evs.filter(e => e.recurrenceId).map(e => `${e.uid}|${e.recurrenceId}`));
  const lignes: Record<string, unknown>[] = [];
  for (const e of evs) {
    const duree = e.fin ? e.fin.getTime() - e.debut.getTime() : 0;
    for (const d of e.recurrenceId ? [e.debut] : occurrences(e, de, a)) {
      if (d.getTime() < de || d.getTime() > a) continue;
      if (!e.recurrenceId && remplaces.has(`${e.uid}|${d.getTime()}`)) continue;
      lignes.push({ uid_externe: `${e.uid}|${d.toISOString()}`, titre: e.titre || '(sans titre)', type: 'Événement',
        statut: e.statut === 'CANCELLED' ? 'Annulé' : 'À faire', planifie_debut: d.toISOString(),
        planifie_fin: duree && !e.jour ? new Date(d.getTime() + duree).toISOString() : null, journee_entiere: e.jour, lieu: e.lieu || null, hors_projet: true });
    }
  }
  // Synchronise la fenêtre importée sans écraser ce que tu as changé dans ORBITE (statut, projet, notes).
  const maintenant = Date.now();
  lignes.forEach(l => { const fin = new Date((l.planifie_fin || l.planifie_debut) as string).getTime(); if (l.statut !== 'Annulé' && fin < maintenant) l.statut = 'Terminé'; });
  const uids = lignes.map(l => l.uid_externe as string);
  const { data: existants } = await sb.from('actions').select('id,uid_externe,statut').not('uid_externe', 'is', null).gte('planifie_debut', new Date(de).toISOString());
  const parUid = new Map((existants || []).map(x => [x.uid_externe, x]));
  const disparus = (existants || []).filter(x => !uids.includes(x.uid_externe) && new Date().toISOString() < x.uid_externe.split('|').pop()).map(x => x.id);
  if (disparus.length) await sb.from('actions').delete().in('id', disparus);
  const nouveaux = lignes.filter(l => !parUid.has(l.uid_externe as string));
  for (let i = 0; i < nouveaux.length; i += 200) {
    const { error } = await sb.from('actions').insert(nouveaux.slice(i, i + 200));
    if (error) return json({ erreur: error.message }, 500);
  }
  for (const l of lignes.filter(l => parUid.has(l.uid_externe as string))) {
    const ex = parUid.get(l.uid_externe as string)!;
    const maj: Record<string, unknown> = { titre: l.titre, planifie_debut: l.planifie_debut, planifie_fin: l.planifie_fin, journee_entiere: l.journee_entiere, lieu: l.lieu };
    if (l.statut === 'Annulé' || (l.statut === 'Terminé' && ex.statut === 'À faire')) maj.statut = l.statut;
    await sb.from('actions').update(maj).eq('id', ex.id);
  }
  return json({ actif: true, evenements: lignes.length, nouveaux: nouveaux.length, retires: disparus.length });
});
