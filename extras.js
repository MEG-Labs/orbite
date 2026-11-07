// Plan du jour, délégations, réglages (notifications, calendriers, sauvegardes, Jira), file hors ligne.
import { SUPABASE_URL } from './config.js';

export function installerExtras(c) {
  const { sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, dialogue, rafraichir, liste, ouvert } = c;
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const vide = m => `<div class="vide">${m}</div>`;
  const reglage = k => S.reglages.find(r => r.cle === k)?.valeur ?? null;
  async function ecrireReglage(cle, valeur) {
    const { error } = await sb.from('reglages').upsert({ cle, valeur });
    if (error) { toast('Échec : ' + error.message); return false; }
    return true;
  }
  async function appeler(fonction, corps = {}) {
    const { data, error } = await sb.functions.invoke(fonction, { body: corps });
    if (error) throw error;
    return data;
  }

  /* ================= Plan du jour ================= */
  function blocPlan() {
    const auj = aujourdhui();
    const plan = S.actions.filter(a => a.plan_du_jour === auj);
    const faits = plan.filter(a => a.statut === 'Terminé').length;
    return bloc('Aujourd’hui, je fais', plan.length ? `${faits}/${plan.length}` : null,
      plan.length ? liste(plan, '') : vide('Choisis au plus trois actions pour ta journée.'),
      `<button class="btn ${plan.length ? 'discret' : ''}" id="choisirPlan">${plan.length ? 'Modifier' : 'Choisir'}</button>`, 'plan-du-jour');
  }
  function choisirPlan() {
    const auj = aujourdhui();
    const candidats = S.actions.filter(a => ouvert(a) && a.type !== 'Événement')
      .sort((a, b) => (b.plan_du_jour === auj) - (a.plan_du_jour === auj) || (a.statut === 'En cours' ? 0 : 1) - (b.statut === 'En cours' ? 0 : 1) || (a.echeance || '9').localeCompare(b.echeance || '9'));
    const d = dialogue(`<form><div class="tete-d"><h2>Aujourd’hui, je fais</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps" style="grid-template-columns:1fr"><p class="aide" style="margin:0">Au plus trois. Ce qui n’est pas fait retourne dans le backlog demain.</p>
      <div class="liste-choix">${candidats.map(a => { const p = parId(S.projets, a.projet_id); return `<label class="choix"><input type="checkbox" name="plan" value="${a.id}" ${a.plan_du_jour === auj ? 'checked' : ''}>
        <span><b>${esc(a.titre)}</b><small>${[a.statut, p?.titre, a.echeance ? 'échéance ' + jourDate(a.echeance) : ''].filter(Boolean).map(esc).join(' · ')}</small></span></label>`; }).join('')}</div></div>
      <div class="pied"><span class="aide gauche" id="compte"></span><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div></form>`, async fd => {
      const ids = fd.getAll('plan');
      if (ids.length > 3) { toast('Trois actions au plus'); return false; }
      const anciens = S.actions.filter(a => a.plan_du_jour === auj && !ids.includes(a.id)).map(a => a.id);
      if (anciens.length) await sb.from('actions').update({ plan_du_jour: null }).in('id', anciens);
      if (ids.length) { const { error } = await sb.from('actions').update({ plan_du_jour: auj }).in('id', ids); if (error) { toast('Échec : ' + error.message); return false; } }
      toast('Plan du jour enregistré'); rafraichir();
    });
    const maj = () => { const n = d.querySelectorAll('[name=plan]:checked').length; d.querySelector('#compte').textContent = `${n}/3`; d.querySelectorAll('[name=plan]:not(:checked)').forEach(x => x.disabled = n >= 3); };
    d.querySelectorAll('[name=plan]').forEach(x => x.onchange = maj); maj();
  }

  /* ================= Délégations ================= */
  function courriel(a, p) {
    const sujet = `Suivi : ${a.titre}`;
    const corps = `Bonjour ${p?.nom?.split(' ')[0] || ''},\n\nJe fais un suivi concernant « ${a.titre} »${a.echeance ? ` (échéance ${jourDate(a.echeance)})` : ''}.\nOù en es-tu? Y a-t-il quelque chose qui te bloque?\n\nMerci,\nMarc-Étienne`;
    return `mailto:${encodeURIComponent(p?.courriel || '')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
  }
  function vueDelegations(v) {
    const auj = aujourdhui();
    const items = S.actions.filter(a => ouvert(a) && (a.delegue_a_id || a.en_attente_de_id || a.statut === 'En attente'));
    const parPers = {};
    items.forEach(a => { const k = a.delegue_a_id || a.en_attente_de_id || '_'; (parPers[k] ||= []).push(a); });
    const dues = items.filter(a => a.relance && a.relance <= auj).length;
    const cles = Object.keys(parPers).sort((x, y) => (parPers[y].some(a => a.relance && a.relance <= auj)) - (parPers[x].some(a => a.relance && a.relance <= auj)) || (parId(S.personnes, x)?.nom || 'ZZ').localeCompare(parId(S.personnes, y)?.nom || 'ZZ'));
    v.innerHTML = `<div class="entete-vue"><div><h1>Ce que j’ai délégué</h1><p class="sous-titre">${items.length} action(s) entre les mains des autres${dues ? ` · <span class="retard">${dues} relance(s) due(s)</span>` : ''}. Le reste, je délègue.</p></div></div>
      ${cles.length ? cles.map(k => {
        const p = parId(S.personnes, k);
        return bloc(esc(p?.nom || 'Personne non précisée'), parPers[k].length, `<ul class="lignes">${parPers[k].map(a => {
          const due = a.relance && a.relance <= auj;
          return `<li class="ligne" data-id="${a.id}" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="titre">${esc(a.titre)}</div><div class="meta">
            <span class="pastille st-${esc(a.statut)}">${esc(a.statut)}</span>${a.delegue_a_id === k ? '<span>Délégué</span>' : '<span>J’attends</span>'}
            ${a.echeance ? `<span class="${a.echeance < auj ? 'retard' : ''}">Échéance ${esc(jourDate(a.echeance))}</span>` : ''}
            ${a.relance ? `<span class="${due ? 'retard' : ''}">Relance ${esc(jourDate(a.relance))}</span>` : '<span>Aucune relance prévue</span>'}</div>
            ${a.prochain_geste ? `<div class="geste">▸ ${esc(a.prochain_geste)}</div>` : ''}</div>
            <div class="boutons-ligne"><a class="btn" href="${courriel(a, p)}" data-stop>Courriel</a><button class="btn discret" data-relance="${a.id}">+3 jours</button></div></li>`; }).join('')}</ul>`, p?.courriel ? `<span class="aide">${esc(p.courriel)}</span>` : '', parPers[k].some(a => a.relance && a.relance <= auj) ? 'signal' : '');
      }).join('') : bloc('Délégations', 0, vide('Rien de délégué. Dans une action, choisis « Délégué à » ou « En attente de » pour la suivre ici.'))}`;
    v.querySelectorAll('[data-stop]').forEach(a => a.onclick = e => e.stopPropagation());
    v.querySelectorAll('[data-relance]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const { error } = await sb.from('actions').update({ relance: plusJours(auj, 3) }).eq('id', b.dataset.relance);
      if (error) return toast('Échec : ' + error.message);
      toast('Relance dans 3 jours'); rafraichir();
    });
  }

  /* ================= Notifications ================= */
  const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(ch => ch.charCodeAt(0))); };
  async function abonnementActuel() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function activerNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast(/iPhone|iPad/.test(navigator.userAgent) ? 'Sur iPhone : ajoute d’abord ORBITE à l’écran d’accueil, puis ouvre-le de là' : 'Ce navigateur ne gère pas les notifications');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notifications refusées dans le navigateur');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(reglage('vapid_public')) });
    const j = sub.toJSON();
    const appareil = /Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Windows/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Navigateur';
    const { error } = await sb.from('push_abonnements').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, appareil }, { onConflict: 'endpoint' });
    if (error) return toast('Échec : ' + error.message);
    toast('Notifications activées sur cet appareil'); rafraichir();
  }
  async function desactiverNotifications() {
    const sub = await abonnementActuel();
    if (sub) { await sb.from('push_abonnements').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    toast('Notifications désactivées sur cet appareil'); rafraichir();
  }

  /* ================= Réglages ================= */
  async function vueReglages(v) {
    const cals = reglage('calendriers_ics') || [];
    const lienCal = `${SUPABASE_URL}/functions/v1/calendrier?jeton=${reglage('calendrier_jeton')}`;
    const heures = Array.from({ length: 24 }, (_, h) => [h, `${h} h`]);
    const optH = (sel) => heures.map(([h, l]) => `<option value="${h}" ${+sel === h ? 'selected' : ''}>${l}</option>`).join('');
    const jiraActif = S.actions.some(a => a.jira_maj_le);
    v.innerHTML = `<div class="entete-vue"><div><h1>Réglages</h1><p class="sous-titre">Notifications, calendriers, sauvegardes et liens externes.</p></div></div>
      <div class="grille">
        <div class="colonne">
          ${bloc('Notifications', null, `<div class="reglage">
            <p>Un résumé chaque matin, un rappel le soir pour le lendemain, et une alerte avant chaque rendez-vous.</p>
            <p id="etatNotif" class="aide">Vérification…</p>
            <div class="rangee"><label class="champ"><span>Résumé du matin</span><select id="hMatin">${optH(reglage('rappel_heure') ?? 6)}</select></label>
              <label class="champ"><span>Rappel du soir</span><select id="hSoir">${optH(reglage('rappel_soir_heure') ?? 19)}</select></label></div>
            <div class="rangee"><button class="btn primaire" id="actNotif">Activer sur cet appareil</button><button class="btn" id="testNotif">Envoyer un test</button><button class="btn discret" id="desNotif">Désactiver ici</button></div>
            <p class="aide">Appareils abonnés : ${S.push.length ? S.push.map(p => esc(p.appareil || 'appareil')).join(', ') : 'aucun'}.${/iPhone|iPad/.test(navigator.userAgent) ? ' Sur iPhone, ORBITE doit être ouvert depuis l’écran d’accueil.' : ''}</p></div>`)}
          ${bloc('ORBITE dans Outlook', null, `<div class="reglage">
            <p>Ajoute ce lien dans Outlook : <b>Calendrier › Ajouter un calendrier › À partir d’Internet</b>. Tes événements, tâches planifiées et trajets apparaîtront dans un calendrier « ORBITE », mis à jour automatiquement.</p>
            <div class="rangee"><input readonly value="${esc(lienCal)}" id="lienCal" aria-label="Lien du calendrier"><button class="btn" id="copierCal">Copier</button></div>
            <p class="aide">Ce lien est privé : toute personne qui l’a peut lire ton agenda ORBITE.</p></div>`)}
          ${bloc('Calendriers importés', null, `<div class="reglage">
            <p>Colle le lien <b>iCal (.ics)</b> d’un calendrier pour voir ses événements dans ORBITE. Ils sont relus chaque heure.</p>
            <p class="aide"><b>Google Agenda</b> (sur ordinateur) : Paramètres › clique le calendrier à gauche › <b>Intégrer l’agenda</b> › « Adresse secrète au format iCal ».<br>
            <b>Outlook</b> : Paramètres › Calendrier › Calendriers partagés › Publier un calendrier › « Peut afficher tous les détails » › lien ICS.</p>
            <ul class="lignes" id="listeCals">${cals.length ? cals.map(c => `<li class="ligne ligne-cal"><div><div class="titre">${esc(c.nom)}</div><div class="meta"><span>${S.actions.filter(a => a.uid_externe?.startsWith(c.id + '|')).length} événement(s)</span><span class="lien-court">${esc(c.lien.replace(/^(https?|webcal):\/\//, '').slice(0, 38))}…</span></div></div><button class="btn discret" data-retirer-cal="${esc(c.id)}">Retirer</button></li>`).join('') : '<li class="ligne"><span class="aide">Aucun calendrier pour l’instant.</span></li>'}</ul>
            <div class="rangee"><input id="nomCal" placeholder="Nom (ex. Famille)" aria-label="Nom du calendrier" style="max-width:180px"><input id="lienNouveauCal" placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" aria-label="Lien iCal"><button class="btn primaire" id="ajoutCal">Ajouter</button></div>
            <div class="rangee"><button class="btn" id="syncCals" ${cals.length ? '' : 'disabled'}>Synchroniser maintenant</button></div>
            <p class="aide">Ces liens sont privés : garde-les pour toi. Retirer un calendrier retire aussi ses événements d’ORBITE.</p></div>`)}
        </div>
        <div class="colonne">
          ${bloc('Sauvegardes', null, `<div class="reglage">
            <p>Une copie complète est faite chaque dimanche matin; les 12 dernières sont conservées.</p>
            <ul class="lignes" id="listeSauv"><li class="ligne"><span class="aide">Chargement…</span></li></ul>
            <div class="rangee"><button class="btn" id="sauvMaint">Sauvegarder maintenant</button><button class="btn primaire" id="exportXlsx">Télécharger en Excel</button></div></div>`)}
          ${bloc('Jira', null, `<div class="reglage">
            <p>Les actions dont la référence externe ressemble à <code>CANAC-734</code> ont un lien direct vers Jira.${jiraActif ? ' Leur statut Jira est relu chaque heure les jours de semaine.' : ''}</p>
            ${jiraActif ? '' : `<p class="aide">Pour afficher aussi le statut Jira, crée un jeton API Atlassian (id.atlassian.com › Sécurité › Jetons API), puis ajoute-le dans Supabase, projet orbite › Edge Functions › Secrets : <code>JIRA_COURRIEL</code> (ton courriel Atlassian) et <code>JIRA_JETON</code>. Vérifie d’abord que la politique de Canac le permet.</p>`}</div>`)}
          ${bloc('Hors ligne', null, `<div class="reglage"><p>Sans réseau, ORBITE affiche la dernière copie de tes données. Les captures faites hors ligne sont envoyées dès le retour du réseau${S.file.length ? ` (${S.file.length} en attente)` : ''}.</p></div>`)}
        </div>
      </div>`;
    // Notifications
    abonnementActuel().then(sub => { const el = $('#etatNotif'); if (el) el.textContent = !('Notification' in window) ? 'Non disponible dans ce navigateur.' : sub ? 'Actives sur cet appareil.' : Notification.permission === 'denied' ? 'Bloquées dans le navigateur.' : 'Pas encore activées sur cet appareil.'; }).catch(() => {});
    $('#actNotif').onclick = () => activerNotifications().catch(e => toast('Échec : ' + e.message));
    $('#desNotif').onclick = () => desactiverNotifications().catch(e => toast('Échec : ' + e.message));
    $('#testNotif').onclick = async () => { try { const r = await appeler('rappels', { test: true }); toast(r.envoyes ? 'Notification envoyée' : (r.raison || 'Aucun appareil abonné')); } catch (e) { toast('Échec : ' + e.message); } };
    $('#hMatin').onchange = async e => { if (await ecrireReglage('rappel_heure', +e.target.value)) toast(`Résumé à ${e.target.value} h`); };
    $('#hSoir').onchange = async e => { if (await ecrireReglage('rappel_soir_heure', +e.target.value)) toast(`Rappel à ${e.target.value} h`); };
    // Calendriers
    $('#copierCal').onclick = async () => { try { await navigator.clipboard.writeText($('#lienCal').value); toast('Lien copié'); } catch { $('#lienCal').select(); } };
    const synchroniser = async (bouton) => {
      if (bouton) bouton.disabled = true;
      try {
        const r = await appeler('outlook');
        const ko = (r.calendriers || []).filter(c => c.erreur);
        toast(r.erreur ? 'Échec : ' + r.erreur : ko.length ? `${r.evenements} événements · problème avec ${ko.map(c => `${c.nom} (${c.erreur})`).join(', ')}` : `${r.evenements} événements synchronisés`);
        rafraichir();
      } catch (er) { toast('Échec : ' + er.message); if (bouton) bouton.disabled = false; }
    };
    $('#ajoutCal').onclick = async () => {
      const nom = $('#nomCal').value.trim() || 'Calendrier', lien = $('#lienNouveauCal').value.trim();
      if (!/^(https?|webcal):\/\//.test(lien)) return toast('Le lien doit commencer par https://');
      if (/calendar\.google\.com\/calendar\/(u\/\d\/)?(r|embed)/.test(lien)) return toast('Ce lien sert à afficher l’agenda. Prends l’« Adresse secrète au format iCal » (finit par .ics).');
      if (cals.some(c => c.lien === lien)) return toast('Ce calendrier est déjà ajouté');
      const id = 'c' + Math.random().toString(36).slice(2, 8);
      if (await ecrireReglage('calendriers_ics', [...cals, { id, nom, lien }])) { toast('Calendrier ajouté · import en cours…'); await synchroniser(); }
    };
    v.querySelectorAll('[data-retirer-cal]').forEach(b => b.onclick = async () => {
      if (b.dataset.ok !== '1') { b.dataset.ok = '1'; b.textContent = 'Confirmer'; return; }
      if (await ecrireReglage('calendriers_ics', cals.filter(c => c.id !== b.dataset.retirerCal))) { toast('Calendrier retiré'); await synchroniser(); }
    });
    $('#syncCals').onclick = e => synchroniser(e.target);
    // Sauvegardes
    const dessinerSauv = async () => {
      const { data, error } = await sb.storage.from('sauvegardes').list('', { sortBy: { column: 'name', order: 'desc' }, limit: 12 });
      const ul = $('#listeSauv'); if (!ul) return;
      if (error || !data?.length) { ul.innerHTML = `<li class="ligne"><span class="aide">${error ? 'Impossible de lire les sauvegardes.' : 'Aucune sauvegarde pour l’instant.'}</span></li>`; return; }
      ul.innerHTML = data.map(f => `<li class="ligne" style="grid-template-columns:minmax(0,1fr) auto"><div class="titre" style="font-weight:400">${esc(jourDate(f.name.slice(7, 17)))} <span class="aide">${Math.round((f.metadata?.size || 0) / 1024)} Ko</span></div><button class="btn discret" data-fichier="${esc(f.name)}">Télécharger</button></li>`).join('');
      ul.querySelectorAll('[data-fichier]').forEach(b => b.onclick = async () => {
        const { data: s, error: er } = await sb.storage.from('sauvegardes').createSignedUrl(b.dataset.fichier, 60, { download: true });
        if (er) return toast('Échec : ' + er.message);
        location.href = s.signedUrl;
      });
    };
    dessinerSauv();
    $('#sauvMaint').onclick = async e => { e.target.disabled = true; try { await appeler('sauvegarde'); toast('Sauvegarde faite'); dessinerSauv(); } catch (er) { toast('Échec : ' + er.message); } e.target.disabled = false; };
    $('#exportXlsx').onclick = () => exporterExcel().catch(er => toast('Échec : ' + er.message));
  }

  async function exporterExcel() {
    toast('Préparation du fichier…');
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs');
    const wb = XLSX.utils.book_new();
    const feuilles = { Actions: S.actions, Projets: S.projets, Achats: S.achats, Abonnements: S.abonnements, Trajets: S.trajets, Véhicules: S.vehicules, Entretiens: S.entretiens,
      Interventions: S.interventions, Livres: S.livres, Budget: S.budget, Notes: S.notes, Routines: S.routines, Personnes: S.personnes, Postes: S.postes, Unités: S.unites, Domaines: S.domaines };
    for (const [nom, lignes] of Object.entries(feuilles)) {
      const plates = lignes.map(r => Object.fromEntries(Object.entries(r).map(([k, val]) => [k, Array.isArray(val) ? val.join(', ') : val])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plates.length ? plates : [{}]), nom.slice(0, 31));
    }
    XLSX.writeFile(wb, `ORBITE-${aujourdhui()}.xlsx`);
  }

  /* ================= File hors ligne ================= */
  const CLE_FILE = 'orbite-file';
  function lireFile() { try { return JSON.parse(localStorage.getItem(CLE_FILE) || '[]'); } catch { return []; } }
  function ecrireFile(f) { try { localStorage.setItem(CLE_FILE, JSON.stringify(f)); } catch { } S.file = f; }
  function mettreEnFile(table, ligne) { ecrireFile([...lireFile(), { table, ligne, le: new Date().toISOString() }]); toast('Hors ligne : capture gardée, envoi au retour du réseau'); }
  async function viderFile() {
    const f = lireFile(); if (!f.length || !navigator.onLine) return;
    const reste = [];
    for (const x of f) { const { error } = await sb.from(x.table).insert(x.ligne); if (error) reste.push(x); }
    ecrireFile(reste);
    if (f.length !== reste.length) { toast(`${f.length - reste.length} capture(s) envoyée(s)`); rafraichir().catch(() => {}); }
  }
  S.file = lireFile();
  window.addEventListener('online', () => viderFile());

  return { vues: { delegations: vueDelegations, reglages: vueReglages }, blocPlan, choisirPlan, mettreEnFile, viderFile };
}
