// ORBITE : rituel de fermeture, journal des victoires, météo intérieure, mode hors travail,
// plans « quand » (placer ses trois actions dans la journée), estimé contre réel, limite des tâches en cours.
export function installerLot6(c) {
  const { sb, S, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, fmtHeure, dialogue, rafraichir, rendre, ouvert, depuisLocal, charge } = c;
  const reglage = (k, defaut) => S.reglages.find(r => r.cle === k)?.valeur ?? defaut;
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const minutesMaintenant = () => { const [h, m] = fmtHeure.format(new Date()).replace(/\s/g, '').split('h').map(Number); return h * 60 + (m || 0); };
  const hhmm = m => `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
  const hhmmIso = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const heureFin = () => +reglage('fermeture_heure', 17);
  const limiteEnCours = () => +reglage('limite_en_cours', 3);
  const finDeSemaine = (j = aujourdhui()) => [0, 6].includes(new Date(j + 'T12:00:00').getDay());
  const journalDu = j => (S.journal || []).find(x => x.date === j);

  /* ================= Travail ou vie ================= */
  const JIRA = /^[A-Z][A-Z0-9]+-\d+$/;
  function estTravail(a) {
    const dt = reglage('domaines_travail', []) || [];
    const dom = a.domaine_id || parId(S.projets, a.projet_id)?.domaine_id;
    return (dom && dt.includes(dom)) || JIRA.test((a.reference_externe || '').trim());
  }
  const projetTravail = p => (reglage('domaines_travail', []) || []).includes(p.domaine_id);

  /* ================= Mode hors travail ================= */
  // Automatique : fin de semaine, après l’heure de fermeture, ou dès que la journée est fermée.
  // Une bascule manuelle vaut jusqu’à minuit.
  const CLE_MODE = 'orbite-mode';
  function forcage() {
    try { const f = JSON.parse(localStorage.getItem(CLE_MODE) || 'null'); return f && f.jour === aujourdhui() ? f.valeur : null; } catch { return null; }
  }
  function raisonAuto() {
    if (finDeSemaine()) return 'fin de semaine';
    if (journalDu(aujourdhui())?.ferme_le) return 'journée fermée';
    if (minutesMaintenant() >= heureFin() * 60) return `après ${heureFin()}\u00a0h`;
    return null;
  }
  function horsTravail() { const f = forcage(); return f ? f === 'hors' : !!raisonAuto(); }
  function basculer() {
    const valeur = horsTravail() ? 'travail' : 'hors';
    // Revenir à ce que donnerait le mode automatique efface la bascule.
    try { if ((valeur === 'hors') === !!raisonAuto()) localStorage.removeItem(CLE_MODE); else localStorage.setItem(CLE_MODE, JSON.stringify({ jour: aujourdhui(), valeur })); } catch { }
    rendre();
  }
  const visible = a => !horsTravail() || a.type === 'Événement' || !estTravail(a);
  const projetVisible = p => !horsTravail() || !projetTravail(p);
  function bandeauMode() {
    const hors = horsTravail(), raison = raisonAuto();
    if (!hors) return raison ? `<div class="bandeau-mode"><span>Travail affiché (${esc(raison)})</span><button class="btn discret" data-mode>Repasser hors travail</button></div>` : '';
    const n = S.actions.filter(a => ouvert(a) && a.type !== 'Événement' && estTravail(a)).length + S.projets.filter(p => p.statut === 'Actif' && projetTravail(p)).length;
    return `<div class="bandeau-mode hors"><span><b>Hors travail</b>${raison ? ' · ' + esc(raison) : ''} · ${pluriel(n, 'élément')} de travail masqué${n > 1 ? 's' : ''}</span><button class="btn discret" data-mode>Afficher le travail</button></div>`;
  }

  /* ================= Estimé contre réel ================= */
  function facteurEstimation(jours = 90) {
    const lim = plusJours(aujourdhui(), -jours);
    const x = S.actions.filter(a => a.duree_min > 0 && a.duree_reelle_min > 0 && a.realisee_le && cleJour(a.realisee_le) >= lim);
    const prevu = x.reduce((s, a) => s + a.duree_min, 0), reel = x.reduce((s, a) => s + a.duree_reelle_min, 0);
    return { n: x.length, f: x.length >= 3 ? reel / prevu : null };
  }
  const libFacteur = f => f >= 1.05 ? `tu prends en moyenne ×${f.toFixed(1).replace('.', ',')} le temps prévu` : f <= 0.95 ? `tu finis en moyenne en ${Math.round(f * 100)} % du temps prévu` : 'tes estimations sont justes';

  /* ================= Limite des tâches en cours ================= */
  function avertEnCours(n) {
    const lim = limiteEnCours();
    return n > lim ? `<div class="avert">${n} en cours pour une limite de ${lim}. Finis avant de commencer : termine une tâche ou remets-la au backlog.</div>` : '';
  }
  const classeEnCours = n => n > limiteEnCours() ? 'attention' : 'calme';

  /* ================= Rituel de fermeture ================= */
  const victoiresDu = j => S.actions.filter(a => a.type !== 'Événement' && a.statut === 'Terminé' && a.realisee_le && cleJour(a.realisee_le) === j);
  function restants() {
    const auj = aujourdhui();
    const vus = new Set();
    return S.actions.filter(a => ouvert(a) && a.type !== 'Événement' && (a.plan_du_jour === auj || a.statut === 'En cours'))
      .filter(a => !vus.has(a.id) && vus.add(a.id))
      .sort((a, b) => (b.plan_du_jour === auj) - (a.plan_du_jour === auj));
  }
  function blocFermeture() {
    const auj = aujourdhui(), j = journalDu(auj), m = minutesMaintenant(), fds = finDeSemaine();
    if (j?.ferme_le) {
      const n = victoiresDu(auj).length;
      return `<div class="fermee"><span>✓ Journée fermée à ${esc(fmtHeure.format(new Date(j.ferme_le)))} · ${pluriel(n, 'victoire')}${j.energie ? ` · énergie ${j.energie}/5` : ''}${j.fierte ? ` · <i>${esc(j.fierte)}</i>` : ''}</span><button class="btn discret" data-fermer-jour>Modifier</button></div>`;
    }
    if (m < heureFin() * 60 - 30) return '';
    const n = victoiresDu(auj).length;
    return bloc(fds ? 'Comment était ta journée ?' : 'Fermer ma journée', null,
      `<div class="vide" style="color:var(--craie)">${fds ? 'Ta victoire du jour et ton énergie, en 30 secondes.' : `${n ? pluriel(n, 'victoire') + ' aujourd’hui. ' : ''}Deux minutes : ce qui reste, une victoire, ton énergie. Puis tu décroches.`}</div>`,
      `<button class="btn primaire" data-fermer-jour>${fds ? 'Noter' : 'Fermer'}</button>`, 'fermeture');
  }
  function ouvrirFermeture() {
    const auj = aujourdhui(), demain = plusJours(auj, 1), j = journalDu(auj) || {}, fds = finDeSemaine();
    const vict = victoiresDu(auj), reste = restants();
    const dejaDemain = S.actions.filter(a => a.plan_du_jour === demain && !reste.includes(a)).length;
    const NIVEAUX = ['Vidé', 'Bas', 'Correct', 'Bon', 'Plein'];
    const d = dialogue(`<form><div class="tete-d"><h2>${fds ? 'Ma journée' : 'Fermer ma journée'}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps rituel" style="grid-template-columns:1fr">
        <section><h3>Tes victoires <span class="nb">${vict.length}</span></h3>
          ${vict.length ? `<ul class="victoires">${vict.map(a => `<li><span>✓ ${esc(a.titre)}</span>${a.duree_min ? `<label class="reel"><input type="number" min="0" step="5" name="reel_${a.id}" value="${a.duree_reelle_min ?? ''}" placeholder="${a.duree_min}" aria-label="Durée réelle en minutes"><small>min réelles · prévu ${a.duree_min}</small></label>` : ''}</li>`).join('')}</ul>`
            : '<p class="aide">Rien de coché aujourd’hui. Avancer compte aussi : note-le plus bas.</p>'}
        </section>
        ${reste.length ? `<section><h3>Ce qui reste <span class="nb">${reste.length}</span></h3>
          <p class="aide">Un prochain geste précis pour chaque tâche inachevée : ta tête peut lâcher prise.</p>
          ${reste.map(a => `<div class="reste"><b>${esc(a.titre)}</b>
            <input name="geste_${a.id}" value="${esc(a.prochain_geste)}" placeholder="Prochain geste (commence par un verbe)" aria-label="Prochain geste pour ${esc(a.titre)}">
            <select name="quand_${a.id}" aria-label="Quand"><option value="demain" ${a.plan_du_jour === auj ? 'selected' : ''}>Demain, dans mes trois</option><option value="garder" ${a.plan_du_jour !== auj ? 'selected' : ''}>Laisser tel quel</option><option value="backlog">Plus tard (backlog)</option></select></div>`).join('')}
        </section>` : ''}
        <section><h3>De quoi es-tu fier aujourd’hui ?</h3>
          <input name="fierte" value="${esc(j.fierte)}" placeholder="Même petit : un appel réglé, un problème débloqué…" maxlength="280"></section>
        <section><h3>Ton énergie</h3>
          <div class="energie" role="radiogroup" aria-label="Énergie de 1 à 5">${NIVEAUX.map((l, i) => `<label><input type="radio" name="energie" value="${i + 1}" ${j.energie === i + 1 ? 'checked' : ''}><span><b>${i + 1}</b>${l}</span></label>`).join('')}</div></section>
      </div>
      <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">${fds ? 'Enregistrer' : 'Fermer la journée'}</button></div></form>`, async fd => {
      const versDemain = reste.filter(a => fd.get('quand_' + a.id) === 'demain');
      if (versDemain.length + dejaDemain > 3) { toast(`Trois actions au plus pour demain (${dejaDemain} déjà choisie${dejaDemain > 1 ? 's' : ''})`); return false; }
      const maj = [];
      vict.forEach(a => { const v = fd.get('reel_' + a.id); if (v != null && v !== '' && +v !== a.duree_reelle_min) maj.push(sb.from('actions').update({ duree_reelle_min: +v }).eq('id', a.id)); });
      reste.forEach(a => {
        const geste = (fd.get('geste_' + a.id) || '').trim() || null, quand = fd.get('quand_' + a.id);
        const champs = {};
        if (geste !== (a.prochain_geste || null)) champs.prochain_geste = geste;
        if (quand === 'demain') champs.plan_du_jour = demain;
        if (quand === 'backlog') { champs.plan_du_jour = null; if (a.statut === 'En cours') champs.statut = 'À faire'; }
        if (Object.keys(champs).length) maj.push(sb.from('actions').update(champs).eq('id', a.id));
      });
      maj.push(sb.from('journal_jours').upsert({ date: auj, fierte: (fd.get('fierte') || '').trim() || null, energie: fd.get('energie') ? +fd.get('energie') : null,
        ferme_le: j.ferme_le || new Date().toISOString(), maj_le: new Date().toISOString() }));
      const res = await Promise.all(maj);
      const err = res.find(r => r.error)?.error;
      if (err) { toast('Échec : ' + err.message); return false; }
      try { localStorage.removeItem(CLE_MODE); } catch { }
      toast(fds ? 'Noté. Bonne soirée.' : 'Journée fermée. Bonne soirée.');
      rafraichir();
    });
    return d;
  }

  /* ================= Plans « quand » : placer ses trois actions ================= */
  function boutonPlacer() {
    const auj = aujourdhui();
    const plan = S.actions.filter(a => a.plan_du_jour === auj && ouvert(a) && a.type !== 'Événement');
    if (!plan.length) return '';
    const places = plan.filter(a => a.planifie_debut && cleJour(a.planifie_debut) === auj).length;
    return `<button class="btn discret" id="placerPlan" title="Choisir une heure pour chaque action">${places === plan.length ? 'Horaire' : places ? `Placer (${places}/${plan.length})` : 'Placer'}</button>`;
  }
  function ouvrirPlacer() {
    const auj = aujourdhui();
    const plan = S.actions.filter(a => a.plan_du_jour === auj && ouvert(a) && a.type !== 'Événement');
    const ch = charge();
    const { f } = facteurEstimation();
    const pas = 15, debut = Math.ceil(Math.max(ch.JOUR_DE, ch.maintenant) / pas) * pas;
    // Plages occupées par les événements et par les autres blocs (pas ceux qu’on replace ici).
    const occupe = [...ch.evts, ...ch.blocs.filter(([, , a]) => !plan.includes(a))].map(([d, fi]) => [d, fi]);
    const libre = (d, dur, pris) => d + dur <= ch.JOUR_A && ![...occupe, ...pris].some(([a, b]) => d < b && d + dur > a);
    const suggere = a => a.duree_min ? Math.max(15, Math.round(a.duree_min * (f || 1) / 5) * 5) : 30;
    // Proposition gloutonne : chaque action à la première plage libre qui la contient.
    const pris = [], propose = {};
    plan.forEach(a => {
      if (a.planifie_debut && cleJour(a.planifie_debut) === auj) { const dm = c.minutesLocales(a.planifie_debut); propose[a.id] = dm; pris.push([dm, dm + suggere(a)]); return; }
      const dur = suggere(a);
      for (let t = debut; t + dur <= ch.JOUR_A; t += pas) if (libre(t, dur, pris)) { propose[a.id] = t; pris.push([t, t + dur]); break; }
    });
    const heures = []; for (let t = debut; t < ch.JOUR_A; t += pas) heures.push(t);
    const d = dialogue(`<form><div class="tete-d"><h2>Placer mes actions</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps" style="grid-template-columns:1fr">
        <p class="aide" style="margin:0">Décider <b>quand</b> tu fais quelque chose rend le passage à l’action nettement plus probable. ${f ? `D’après tes ${facteurEstimation().n} dernières tâches, ${libFacteur(f)} : les durées proposées en tiennent compte.` : 'Note des durées prévues et réelles pour que les propositions s’ajustent à ton rythme.'}</p>
        ${heures.length ? plan.map(a => `<div class="placer"><b>${esc(a.titre)}</b>
          <label class="champ"><span>À</span><select name="h_${a.id}"><option value="">Pas d’heure</option>${heures.map(t => `<option value="${t}" ${propose[a.id] === t ? 'selected' : ''}>${hhmm(t)}${occupe.some(([x, y]) => t >= x && t < y) ? ' · occupé' : ''}</option>`).join('')}</select></label>
          <label class="champ"><span>Durée (min)</span><input type="number" name="d_${a.id}" min="5" step="5" value="${suggere(a)}"></label></div>`).join('')
          : '<p class="vide" style="padding:0">La plage de travail est terminée pour aujourd’hui. Garde ces actions pour demain matin.</p>'}
      </div>
      <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button>${heures.length ? '<button type="submit" class="btn primaire">Placer</button>' : ''}</div></form>`, async fd => {
      const maj = plan.map(a => {
        const h = fd.get('h_' + a.id), dur = +fd.get('d_' + a.id) || 30;
        if (!h) return a.planifie_debut && cleJour(a.planifie_debut) === auj ? sb.from('actions').update({ planifie_debut: null, planifie_fin: null }).eq('id', a.id) : null;
        const deb = depuisLocal(`${auj}T${hhmmIso(+h)}`), fin = depuisLocal(`${auj}T${hhmmIso(Math.min(+h + dur, 23 * 60 + 59))}`);
        return sb.from('actions').update({ planifie_debut: deb, planifie_fin: fin, journee_entiere: false, ...(a.duree_min ? {} : { duree_min: dur }) }).eq('id', a.id);
      }).filter(Boolean);
      const res = await Promise.all(maj);
      const err = res.find(r => r.error)?.error;
      if (err) { toast('Échec : ' + err.message); return false; }
      toast('Actions placées dans ta journée'); rafraichir();
    });
    return d;
  }

  /* ================= Revue hebdo : énergie, charge, estimations ================= */
  function heuresRdv(j) {
    const ms = S.actions.filter(a => a.type === 'Événement' && !a.journee_entiere && a.statut !== 'Annulé' && a.planifie_debut && cleJour(a.planifie_debut) === j)
      .reduce((s, a) => s + Math.max(0, new Date(a.planifie_fin || a.planifie_debut) - new Date(a.planifie_debut) || 30 * 6e4), 0);
    return ms / 36e5;
  }
  function blocRevue() {
    const auj = aujourdhui();
    const jours = Array.from({ length: 7 }, (_, i) => plusJours(auj, i - 6));
    const moy = liste => { const v = liste.map(journalDu).map(x => x?.energie).filter(Boolean); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
    const cette = moy(jours), avant = moy(Array.from({ length: 7 }, (_, i) => plusJours(auj, i - 13)));
    const fermes = jours.filter(j => journalDu(j)?.ferme_le && !finDeSemaine(j)).length, ouvrables = jours.filter(j => !finDeSemaine(j)).length;
    const { n, f } = facteurEstimation();
    const fmt = x => x.toFixed(1).replace('.', ',');
    const lignes = jours.map(j => {
      const e = journalDu(j)?.energie, h = heuresRdv(j), v = victoiresDu(j).length;
      return `<tr><th scope="row">${esc(jourDate(j))}</th><td><span class="points" aria-label="${e ? 'énergie ' + e + ' sur 5' : 'non notée'}">${e ? '●'.repeat(e) + '<i>' + '●'.repeat(5 - e) + '</i>' : '<i>—</i>'}</span></td><td>${h ? fmt(h) + ' h' : '—'}</td><td>${v || '—'}</td></tr>`;
    }).join('');
    const constats = [];
    if (cette != null) constats.push(`Énergie moyenne ${fmt(cette)}/5${avant != null ? ` (semaine précédente ${fmt(avant)})` : ''}.`);
    if (cette != null && cette <= 2.5) constats.push('Semaine exigeante : allège la prochaine (une soirée sans écran, moins de rendez-vous, une tâche déléguée).');
    const lourds = jours.filter(j => heuresRdv(j) >= 5 && (journalDu(j)?.energie || 5) <= 2);
    if (lourds.length) constats.push(`Les journées à 5 h et plus de rendez-vous te vident (${lourds.map(jourDate).join(', ')}). Protège des plages sans réunion.`);
    constats.push(f ? `Estimations : ${libFacteur(f)} (${n} tâches sur 90 jours).` : `Estimations : ${n}/3 tâches avec durée prévue et réelle, pas encore assez pour un facteur.`);
    if (ouvrables) constats.push(`Journées fermées : ${fermes}/${ouvrables}.`);
    return bloc('Énergie et charge · 7 jours', null, `<table class="tableau-energie"><thead><tr><th>Jour</th><th>Énergie</th><th>Rendez-vous</th><th>Victoires</th></tr></thead><tbody>${lignes}</tbody></table>
      <ul class="constats">${constats.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }

  /* ================= Branchements ================= */
  function brancher(v) {
    v.querySelectorAll('[data-mode]').forEach(b => b.onclick = basculer);
    v.querySelectorAll('[data-fermer-jour]').forEach(b => b.onclick = ouvrirFermeture);
    const pp = v.querySelector('#placerPlan'); if (pp) pp.onclick = ouvrirPlacer;
  }

  return { estTravail, horsTravail, visible, projetVisible, bandeauMode, basculer, facteurEstimation, avertEnCours, classeEnCours,
    blocFermeture, ouvrirFermeture, boutonPlacer, ouvrirPlacer, blocRevue, brancher };
}
