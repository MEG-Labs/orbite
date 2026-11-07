// Notifications : résumé du matin et rappel du soir (appel horaire à :15),
// rappel 15 minutes avant chaque événement et trajet (appel aux 5 minutes avec {"mode":"rdv"}).
import webpush from 'npm:web-push@3.6.7';
import { admin, secret, reglage, autorise, cors, json, cleJour, heureLocale, fmtHeure, plusJours, argent } from './commun.ts';

const OUVERTS = ['À traiter', 'À faire', 'En cours', 'En attente', 'Bloqué'];

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  const qui = await autorise(req, sb);
  if (!qui) return json({ erreur: 'non autorisé' }, 401);
  const corps = await req.json().catch(() => ({}));

  webpush.setVapidDetails('mailto:orbite@meglabs.ca', (await secret(sb, 'vapid_public'))!, (await secret(sb, 'vapid_prive'))!);
  const { data: abos } = await sb.from('push_abonnements').select('*');
  if (!abos?.length) return json({ envoyes: 0, raison: 'aucun appareil abonné' });

  const maintenant = new Date();
  const auj = cleJour(maintenant), demain = plusJours(auj, 1);
  const h = heureLocale(maintenant);
  const hMatin = +(await reglage(sb, 'rappel_heure') ?? 6), hSoir = +(await reglage(sb, 'rappel_soir_heure') ?? 19);
  const messages: { title: string; body: string; url: string; tag: string }[] = [];

  if (corps.test) messages.push({ title: 'ORBITE', body: 'Les notifications fonctionnent sur cet appareil.', url: './', tag: 'test' });

  if (corps.mode === 'rdv') return json(await rappelsRdv(sb, abos));

  const [{ data: actions }, { data: trajets }, { data: abonnements }] = await Promise.all([
    sb.from('actions').select('titre,statut,type,planifie_debut,planifie_fin,journee_entiere,echeance,relance,plan_du_jour'),
    sb.from('trajets').select('titre,date_heure,responsable,statut').gte('date_heure', plusJours(auj, -1)).lte('date_heure', plusJours(auj, 3)),
    sb.from('abonnements').select('nom,montant,prochaine_facturation,fin_essai,statut'),
  ]);
  const A = actions || [], T = (trajets || []).filter(t => t.statut !== 'Annulé');

  if (h === hMatin || corps.forcer === 'matin') {
    const evts = A.filter(a => OUVERTS.includes(a.statut) && a.planifie_debut && cleJour(a.planifie_debut) === auj).sort((a, b) => a.planifie_debut.localeCompare(b.planifie_debut));
    const retards = A.filter(a => OUVERTS.includes(a.statut) && a.echeance && a.echeance < auj);
    const echeances = A.filter(a => OUVERTS.includes(a.statut) && a.echeance === auj);
    const relances = A.filter(a => OUVERTS.includes(a.statut) && a.relance && a.relance <= auj);
    const plan = A.filter(a => a.plan_du_jour === auj && OUVERTS.includes(a.statut));
    const tAuj = T.filter(t => cleJour(t.date_heure) === auj);
    const sansResp = tAuj.filter(t => !t.responsable);
    const factu = (abonnements || []).filter(x => ['Actif', 'Essai'].includes(x.statut) && (x.prochaine_facturation === auj || x.fin_essai === auj || x.fin_essai === demain));
    const l: string[] = [];
    if (evts.length) l.push(`${evts.length} à l’agenda : ` + evts.slice(0, 3).map(a => (a.journee_entiere ? '' : fmtHeure(a.planifie_debut) + ' ') + a.titre).join(', '));
    if (plan.length) l.push('Ton plan : ' + plan.map(a => a.titre).join(', '));
    if (echeances.length) l.push(`Échéance aujourd’hui : ${echeances.map(a => a.titre).join(', ')}`);
    if (retards.length) l.push(`${retards.length} tâche${retards.length > 1 ? 's' : ''} en retard`);
    if (relances.length) l.push(`${relances.length} relance${relances.length > 1 ? 's' : ''} à faire`);
    if (sansResp.length) l.push(`${sansResp.length} trajet${sansResp.length > 1 ? 's' : ''} sans responsable aujourd’hui`);
    else if (tAuj.length) l.push('Transports : ' + tAuj.map(t => `${fmtHeure(t.date_heure)} ${t.responsable}`).join(' · '));
    factu.forEach(x => l.push(x.fin_essai === demain ? `Fin d’essai demain : ${x.nom}` : `Facturation ${x.nom} ${argent(x.montant)}`));
    if (l.length) messages.push({ title: 'Ta journée ORBITE', body: l.join('\n'), url: './', tag: 'matin-' + auj });
  }

  if (h === hSoir || corps.forcer === 'soir') {
    const tDemain = T.filter(t => cleJour(t.date_heure) === demain);
    const sansResp = tDemain.filter(t => !t.responsable);
    const evts = A.filter(a => OUVERTS.includes(a.statut) && a.planifie_debut && cleJour(a.planifie_debut) === demain);
    const l: string[] = [];
    if (sansResp.length) l.push(`${sansResp.length} trajet${sansResp.length > 1 ? 's' : ''} de demain sans responsable : ` + sansResp.map(t => fmtHeure(t.date_heure)).join(', '));
    // Conflits : un trajet à ma charge pendant un événement.
    const moi = String(await reglage(sb, 'moi_transport') ?? 'Papa');
    const conflits = tDemain.filter(t => t.responsable === moi).filter(t => evts.some(e => chevauche(t.date_heure, e)));
    if (conflits.length) l.push(`Conflit : ` + conflits.map(t => `trajet ${fmtHeure(t.date_heure)} pendant « ${evts.find(e => chevauche(t.date_heure, e))!.titre} »`).join(', '));
    if (evts.length) l.push(`Demain : ` + evts.slice(0, 3).map(a => (a.journee_entiere ? '' : fmtHeure(a.planifie_debut) + ' ') + a.titre).join(', '));
    if (l.length) messages.push({ title: 'Pour demain', body: l.join('\n'), url: sansResp.length || l.some(x => x.startsWith('Conflit')) ? './#transports' : './#agenda', tag: 'soir-' + auj });
  }

  const envoyes = await envoyer(sb, abos, messages);
  return json({ envoyes, messages: messages.length, heure: h });
});

// Un trajet occupe de 30 min avant à 30 min après son heure; il entre en conflit avec un événement qui chevauche cette plage.
function chevauche(dh: string, e: { planifie_debut: string; planifie_fin?: string | null; journee_entiere?: boolean }) {
  if (e.journee_entiere) return false;
  const t = new Date(dh).getTime(), d = new Date(e.planifie_debut).getTime(), f = new Date(e.planifie_fin || e.planifie_debut).getTime() || d;
  return t - 30 * 6e4 < Math.max(f, d + 30 * 6e4) && t + 30 * 6e4 > d;
}

type Abo = { id: string; endpoint: string; p256dh: string; auth: string };
type Msg = { title: string; body: string; url: string; tag: string };

// Événements et trajets qui commencent dans 10 à 20 minutes; chaque rappel n'est envoyé qu'une fois.
async function rappelsRdv(sb: ReturnType<typeof admin>, abos: Abo[]) {
  const maintenant = Date.now();
  const de = new Date(maintenant + 10 * 6e4).toISOString(), a = new Date(maintenant + 20 * 6e4).toISOString();
  const moi = String(await reglage(sb, 'moi_transport') ?? 'Papa');
  const [{ data: evts }, { data: trajets }] = await Promise.all([
    sb.from('actions').select('id,titre,statut,planifie_debut,planifie_fin,lieu,source_externe').eq('type', 'Événement').eq('journee_entiere', false)
      .in('statut', OUVERTS).gte('planifie_debut', de).lt('planifie_debut', a),
    sb.from('trajets').select('id,titre,date_heure,enfants,depart,destination,responsable,statut').gte('date_heure', de).lt('date_heure', a).neq('statut', 'Annulé'),
  ]);
  const candidats: (Msg & { cle: string })[] = [];
  for (const e of evts || []) {
    const lignes = [e.planifie_fin ? `Jusqu’à ${fmtHeure(e.planifie_fin)}` : '', e.lieu ? `📍 ${e.lieu}` : '', e.source_externe || ''].filter(Boolean);
    candidats.push({ cle: `rdv|${e.id}|${e.planifie_debut}`, title: `Dans 15 min · ${fmtHeure(e.planifie_debut)} ${e.titre}`, body: lignes.join('\n') || 'Commence bientôt.', url: './#agenda', tag: 'rdv-' + e.id });
  }
  for (const t of (trajets || []).filter(t => !t.responsable || t.responsable === moi)) {
    const trajet = [t.enfants, [t.depart, t.destination].filter(Boolean).join(' → ')].filter(Boolean).join(' · ');
    candidats.push({ cle: `trajet|${t.id}|${t.date_heure}`, title: `${t.responsable ? 'Ton trajet' : 'Trajet sans responsable'} · ${fmtHeure(t.date_heure)}`, body: trajet || t.titre || '', url: './#transports', tag: 'trajet-' + t.id });
  }
  const messages: Msg[] = [];
  for (const c of candidats) {
    const { data } = await sb.from('rappels_envoyes').upsert({ cle: c.cle }, { onConflict: 'cle', ignoreDuplicates: true }).select('cle');
    if (data?.length) { const { cle: _, ...m } = c; messages.push(m); }
  }
  return { mode: 'rdv', envoyes: await envoyer(sb, abos, messages), messages: messages.length };
}

async function envoyer(sb: ReturnType<typeof admin>, abos: Abo[], messages: Msg[]) {
  let envoyes = 0;
  for (const m of messages) for (const s of abos) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(m), { TTL: 3600 });
      envoyes++;
      await sb.from('push_abonnements').update({ dernier_envoi: new Date().toISOString() }).eq('id', s.id);
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await sb.from('push_abonnements').delete().eq('id', s.id);
      else console.error('push', code, String(e));
    }
  }
  return envoyes;
}
