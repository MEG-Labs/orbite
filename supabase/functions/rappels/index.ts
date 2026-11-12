// Notifications : résumé du matin et rappel du soir (appel horaire à :15),
// invitation à fermer la journée (jours de semaine, heure de fermeture),
// rappel 15 minutes avant chaque événement et trajet (appel aux 5 minutes avec {"mode":"rdv"}),
// revue hebdo : vendredi à revue_heure (19 h), relances samedi et dimanche à revue_relance_heure (10 h) si elle n’est pas faite.
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
    sb.from('actions').select('titre,statut,type,planifie_debut,planifie_fin,journee_entiere,echeance,relance,plan_du_jour,realisee_le'),
    sb.from('trajets').select('titre,enfants,date_heure,responsable,statut').gte('date_heure', plusJours(auj, -1)).lte('date_heure', plusJours(auj, 3)),
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
    const conflitAvec = (t: { date_heure: string; enfants?: string | null }) => evts.find(e => chevauche(t.date_heure, e) && !correspond(t, e));
    const conflits = tDemain.filter(t => t.responsable === moi).filter(t => conflitAvec(t));
    if (conflits.length) l.push(`Conflit : ` + conflits.map(t => `trajet ${fmtHeure(t.date_heure)} pendant « ${conflitAvec(t)!.titre} »`).join(', '));
    if (evts.length) l.push(`Demain : ` + evts.slice(0, 3).map(a => (a.journee_entiere ? '' : fmtHeure(a.planifie_debut) + ' ') + a.titre).join(', '));
    if (l.length) messages.push({ title: 'Pour demain', body: l.join('\n'), url: sansResp.length || l.some(x => x.startsWith('Conflit')) ? './#transports' : './#agenda', tag: 'soir-' + auj });
  }

  // Rituel de fermeture : jours de semaine à l’heure de fermeture, si la journée n’est pas déjà fermée.
  const hFermeture = +(await reglage(sb, 'fermeture_heure') ?? 17);
  const jourSem = new Date(auj + 'T12:00:00Z').getUTCDay();
  if ((h === hFermeture && jourSem >= 1 && jourSem <= 5) || corps.forcer === 'fermeture') {
    const { data: j } = await sb.from('journal_jours').select('ferme_le').eq('date', auj).maybeSingle();
    if (!j?.ferme_le) {
      const faits = A.filter(a => a.type !== 'Événement' && a.statut === 'Terminé' && a.realisee_le && cleJour(a.realisee_le) === auj).length;
      messages.push({ title: 'Ferme ta journée', body: `${faits ? `${faits} victoire${faits > 1 ? 's' : ''} aujourd’hui. ` : ''}Deux minutes pour noter ce qui reste, puis tu décroches.`, url: './#fermer', tag: 'fermeture-' + auj });
    }
  }

  // Revue hebdo : tant que « Revue terminée » n’a pas été cliqué cette semaine (réglage revue_faite = { semaine, le }).
  const hRevue = +(await reglage(sb, 'revue_heure') ?? 19), hRelance = +(await reglage(sb, 'revue_relance_heure') ?? 10);
  if ((jourSem === 5 && h === hRevue) || ((jourSem === 6 || jourSem === 0) && h === hRelance) || corps.forcer === 'revue') {
    const sem = semaineIso(auj);
    const faite = await reglage(sb, 'revue_faite') as { semaine?: string } | null;
    if (faite?.semaine !== sem) {
      const captures = A.filter(a => a.statut === 'À traiter').length;
      const retards = A.filter(a => OUVERTS.includes(a.statut) && a.echeance && a.echeance < auj).length;
      const etat = [captures ? `${captures} capture${captures > 1 ? 's' : ''} à trier` : '', retards ? `${retards} en retard` : ''].filter(Boolean).join(' · ');
      messages.push({ title: jourSem === 5 ? '📋 C’est l’heure de ta revue hebdo' : '📋 Revue hebdo toujours à faire',
        body: `Environ 20 minutes pour vider les captures, débloquer les projets et choisir une semaine réaliste.${etat ? '\n' + etat : ''}`, url: './#revue', tag: 'revue-' + sem });
    }
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

// Un événement qui EST le trajet (« Pick-up Édouard » pour « Récupérer Édouard ») : il nomme un enfant ou un geste de transport.
const sansAccent = (s?: string | null) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const MOTS_VIDES = ['les', 'des', 'deux', 'trois', 'quatre', 'cinq', 'et', 'avec'];
const GESTE_TRANSPORT = /pick ?-?up|recuper|depos|drop|cherch|reconduir|transport|covoit|lift/;
function correspond(t: { date_heure: string; enfants?: string | null }, e: { titre: string; planifie_debut: string; planifie_fin?: string | null; journee_entiere?: boolean }) {
  if (!chevauche(t.date_heure, e)) return false;
  const titre = sansAccent(e.titre);
  const noms = sansAccent(t.enfants).split(/[^a-z]+/).filter(m => m.length >= 3 && !MOTS_VIDES.includes(m));
  return noms.some(n => titre.includes(n)) || GESTE_TRANSPORT.test(titre);
}

type Abo = { id: string; endpoint: string; p256dh: string; auth: string };
type Msg = { title: string; body: string; url: string; tag: string };

// Événements et trajets qui commencent dans 10 à 20 minutes; chaque rappel n'est envoyé qu'une fois.
async function rappelsRdv(sb: ReturnType<typeof admin>, abos: Abo[]) {
  const maintenant = Date.now();
  const de = new Date(maintenant + 10 * 6e4).toISOString(), a = new Date(maintenant + 20 * 6e4).toISOString();
  const moi = String(await reglage(sb, 'moi_transport') ?? 'Papa');
  const [{ data: evts }, { data: trajets }, { data: autour }] = await Promise.all([
    sb.from('actions').select('id,titre,statut,planifie_debut,planifie_fin,lieu,source_externe').eq('type', 'Événement').eq('journee_entiere', false)
      .in('statut', OUVERTS).gte('planifie_debut', de).lt('planifie_debut', a),
    sb.from('trajets').select('id,titre,date_heure,enfants,depart,destination,responsable,statut').gte('date_heure', de).lt('date_heure', a).neq('statut', 'Annulé'),
    // Événements autour des trajets : un trajet déjà à l’agenda n’a pas besoin d’un second rappel.
    sb.from('actions').select('titre,planifie_debut,planifie_fin,journee_entiere').eq('type', 'Événement').eq('journee_entiere', false).neq('statut', 'Annulé')
      .gte('planifie_debut', new Date(maintenant - 60 * 6e4).toISOString()).lt('planifie_debut', new Date(maintenant + 80 * 6e4).toISOString()),
  ]);
  const candidats: (Msg & { cle: string })[] = [];
  for (const e of evts || []) {
    const lignes = [e.planifie_fin ? `Jusqu’à ${fmtHeure(e.planifie_fin)}` : '', e.lieu ? `📍 ${e.lieu}` : '', e.source_externe || ''].filter(Boolean);
    candidats.push({ cle: `rdv|${e.id}|${e.planifie_debut}`, title: `Dans 15 min · ${fmtHeure(e.planifie_debut)} ${e.titre}`, body: lignes.join('\n') || 'Commence bientôt.', url: './#agenda', tag: 'rdv-' + e.id });
  }
  for (const t of (trajets || []).filter(t => (!t.responsable || t.responsable === moi) && !(autour || []).some(e => correspond(t, e)))) {
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

// Semaine ISO au format de l’app (« 2026-S46 »), calculée sur la date locale AAAA-MM-JJ.
function semaineIso(cle: string) {
  const d = new Date(cle + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7);
  const a = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return `${d.getUTCFullYear()}-S${String(1 + Math.round(((d.getTime() - a.getTime()) / 864e5 - 3 + (a.getUTCDay() + 6) % 7) / 7)).padStart(2, '0')}`;
}
