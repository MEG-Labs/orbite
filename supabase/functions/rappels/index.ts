// Notifications : résumé du matin, rappel du soir, rendez-vous dans l'heure. Appelée chaque heure à :15.
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

  const [{ data: actions }, { data: trajets }, { data: abonnements }] = await Promise.all([
    sb.from('actions').select('titre,statut,type,planifie_debut,journee_entiere,echeance,relance,plan_du_jour'),
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
    if (evts.length) l.push(`Demain : ` + evts.slice(0, 3).map(a => (a.journee_entiere ? '' : fmtHeure(a.planifie_debut) + ' ') + a.titre).join(', '));
    if (l.length) messages.push({ title: 'Pour demain', body: l.join('\n'), url: sansResp.length ? './#transports' : './#agenda', tag: 'soir-' + auj });
  }

  // Rendez-vous qui commencent entre +15 et +75 min (fenêtres sans chevauchement d'un appel horaire à l'autre)
  const de = maintenant.getTime() + 15 * 6e4, a = maintenant.getTime() + 75 * 6e4;
  A.filter(x => OUVERTS.includes(x.statut) && x.type === 'Événement' && !x.journee_entiere && x.planifie_debut)
    .filter(x => { const t = new Date(x.planifie_debut).getTime(); return t >= de && t < a; })
    .forEach(x => messages.push({ title: `${fmtHeure(x.planifie_debut)} · ${x.titre}`, body: 'Commence bientôt.', url: './#agenda', tag: 'rdv-' + x.planifie_debut }));

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
  return json({ envoyes, messages: messages.length, heure: h });
});
