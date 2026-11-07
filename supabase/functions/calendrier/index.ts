// Flux iCalendar d'ORBITE à ajouter dans Outlook (Ajouter un calendrier > À partir d'Internet).
import { admin, secret, cors, cleJour, plusJours } from './commun.ts';

const esc = (s: string) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const utc = (d: string | Date) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const plier = (l: string) => { const out: string[] = []; let s = l; while (new TextEncoder().encode(s).length > 74) { let i = 74; while (new TextEncoder().encode(s.slice(0, i)).length > 74) i--; out.push(s.slice(0, i)); s = ' ' + s.slice(i); } out.push(s); return out.join('\r\n'); };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = new URL(req.url);
  const sb = admin();
  if (!url.searchParams.get('jeton') || url.searchParams.get('jeton') !== await secret(sb, 'calendrier')) return new Response('Jeton invalide', { status: 401 });
  const avecTrajets = url.searchParams.get('trajets') !== '0';
  const depuis = plusJours(cleJour(new Date()), -30), jusqua = plusJours(cleJour(new Date()), 180);

  const { data: actions } = await sb.from('actions').select('id,titre,statut,type,planifie_debut,planifie_fin,journee_entiere,lieu,prochain_geste,maj_le,uid_externe')
    .not('planifie_debut', 'is', null).neq('statut', 'Annulé').gte('planifie_debut', depuis).lte('planifie_debut', jusqua + 'T23:59:59Z');
  const lignes = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MEG Labs//ORBITE//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:ORBITE', 'X-WR-TIMEZONE:America/Toronto', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const a of actions || []) {
    if (a.uid_externe) continue; // ne pas renvoyer vers Outlook ce qui vient d'Outlook
    lignes.push('BEGIN:VEVENT', `UID:${a.id}@orbite`, `DTSTAMP:${utc(a.maj_le || new Date())}`);
    if (a.journee_entiere) {
      const j = cleJour(a.planifie_debut);
      lignes.push(`DTSTART;VALUE=DATE:${j.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${plusJours(j, 1).replace(/-/g, '')}`);
    } else {
      const fin = a.planifie_fin || new Date(new Date(a.planifie_debut).getTime() + 30 * 6e4).toISOString();
      lignes.push(`DTSTART:${utc(a.planifie_debut)}`, `DTEND:${utc(fin)}`);
    }
    lignes.push(`SUMMARY:${esc((a.type === 'Tâche' ? '☐ ' : '') + a.titre)}`);
    if (a.lieu) lignes.push(`LOCATION:${esc(a.lieu)}`);
    if (a.prochain_geste) lignes.push(`DESCRIPTION:${esc(a.prochain_geste)}`);
    if (a.statut === 'Terminé') lignes.push('STATUS:CONFIRMED');
    lignes.push('TRANSP:' + (a.type === 'Événement' ? 'OPAQUE' : 'TRANSPARENT'), 'END:VEVENT');
  }
  if (avecTrajets) {
    const { data: trajets } = await sb.from('trajets').select('id,titre,date_heure,responsable,enfants,statut').neq('statut', 'Annulé').gte('date_heure', depuis).lte('date_heure', jusqua + 'T23:59:59Z');
    for (const t of trajets || []) {
      const fin = new Date(new Date(t.date_heure).getTime() + 20 * 6e4);
      lignes.push('BEGIN:VEVENT', `UID:${t.id}@orbite-trajet`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(t.date_heure)}`, `DTEND:${utc(fin)}`,
        `SUMMARY:${esc('🚗 ' + t.titre.split(' • ').pop() + (t.responsable ? ' (' + t.responsable + ')' : ' (à attribuer)'))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
    }
  }
  lignes.push('END:VCALENDAR');
  return new Response(lignes.map(plier).join('\r\n') + '\r\n', { headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="orbite.ics"', 'Cache-Control': 'no-cache' } });
});
