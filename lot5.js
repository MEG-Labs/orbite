// ORBITE : conflits de transport, charge du jour, comptes rendus, règles de classement,
// ligne de temps des projets, pneus d'hiver selon la météo, recherche globale.
export function installerLot5(c) {
  const { sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, jourLong, cleJour, fmtHeure, dialogue, rafraichir, ouvert } = c;
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const vide = m => `<div class="vide">${m}</div>`;
  const reglage = cle => S.reglages.find(r => r.cle === cle)?.valeur;
  const hm = d => fmtHeure.format(new Date(d));
  const minutesLocales = d => { const [h, m] = hm(d).replace(/\s/g, '').split('h').map(Number); return h * 60 + (m || 0); };
  const duree = min => min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ' ' + String(min % 60).padStart(2, '0') : ''}` : `${min} min`;

  /* ================= 1. Conflits trajets / événements ================= */
  const moi = () => reglage('moi_transport') || 'Papa';
  const evtsHoraires = () => S.actions.filter(a => a.type === 'Événement' && !a.journee_entiere && a.planifie_debut && a.statut !== 'Annulé');
  // Un trajet occupe de 30 min avant à 30 min après son heure.
  function chevauche(dh, e) {
    const t = new Date(dh).getTime(), d = new Date(e.planifie_debut).getTime();
    const f = Math.max(new Date(e.planifie_fin || e.planifie_debut).getTime(), d + 30 * 6e4);
    return t - 30 * 6e4 < f && t + 30 * 6e4 > d;
  }
  function conflitDe(t) {
    if (!t?.date_heure || ['Annulé', 'Fait'].includes(t.statut)) return null;
    if (t.responsable && t.responsable !== moi()) return null;
    return evtsHoraires().find(e => chevauche(t.date_heure, e)) || null;
  }
  function conflits() {
    const auj = aujourdhui(), fin = plusJours(auj, 7), maintenant = Date.now();
    return S.trajets.filter(t => t.responsable === moi() && t.date_heure && new Date(t.date_heure).getTime() > maintenant && cleJour(t.date_heure) <= fin)
      .map(t => [t, conflitDe(t)]).filter(([, e]) => e).sort((a, b) => a[0].date_heure.localeCompare(b[0].date_heure));
  }
  function blocConflits() {
    const liste = conflits();
    if (!liste.length) return '';
    const autres = [...new Set(['Maman', 'Papa', 'Mamie', ...S.trajets.map(t => t.responsable).filter(Boolean)])].filter(r => r !== moi());
    return bloc('Conflits famille et travail', liste.length, `<ul class="lignes">${liste.map(([t, e]) => {
      const j = cleJour(t.date_heure);
      return `<li class="ligne ligne-conflit" style="grid-template-columns:minmax(0,1fr) auto"><div>
        <div class="titre">${esc(t.titre.split(' • ').pop())}</div>
        <div class="meta"><span>${esc(j === aujourdhui() ? 'Aujourd’hui' : j === plusJours(aujourdhui(), 1) ? 'Demain' : jourLong(j))} ${esc(hm(t.date_heure))}</span>
          <span class="retard">pendant « ${esc(e.titre)} » ${esc(hm(e.planifie_debut))}${e.planifie_fin ? '–' + esc(hm(e.planifie_fin)) : ''}</span></div></div>
        <select data-deleguer="${t.id}" aria-label="Déléguer le trajet"><option value="">Déléguer à…</option>${autres.map(r => `<option>${esc(r)}</option>`).join('')}</select></li>`;
    }).join('')}</ul>`, '<button class="btn discret" data-aller="transports">Transports</button>', 'signal');
  }
  function brancherConflits(v) {
    v.querySelectorAll('[data-deleguer]').forEach(s => s.onchange = async () => {
      if (!s.value) return;
      const { error } = await sb.from('trajets').update({ responsable: s.value, statut: 'À confirmer' }).eq('id', s.dataset.deleguer);
      if (error) return toast('Échec : ' + error.message);
      toast(`Trajet délégué à ${s.value} (à confirmer)`); rafraichir();
    });
  }

  /* ================= 3. Charge de la journée ================= */
  const JOUR_DE = 8 * 60, JOUR_A = 17 * 60;
  // Plage [début, fin] en minutes du jour, bornée à 8 h–17 h ; un élément sans fin occupe 30 min.
  function plage(a, auj) {
    return [Math.max(JOUR_DE, minutesLocales(a.planifie_debut)), Math.min(JOUR_A, a.planifie_fin && cleJour(a.planifie_fin) === auj ? minutesLocales(a.planifie_fin) : minutesLocales(a.planifie_debut) + (a.duree_min || 30))];
  }
  function fusionner(liste) {
    const occ = [];
    for (const [d, f] of [...liste].sort((a, b) => a[0] - b[0])) { const der = occ[occ.length - 1]; if (der && d <= der[1]) der[1] = Math.max(der[1], f); else occ.push([d, f]); }
    return occ;
  }
  function chargeDuJour() {
    const auj = aujourdhui();
    const evts = evtsHoraires().filter(e => cleJour(e.planifie_debut) === auj)
      .map(e => [...plage({ ...e, duree_min: null }, auj), e]).filter(([d, f]) => f > d);
    // Blocs de travail : tâches placées à une heure précise aujourd’hui (plans « quand »).
    const blocs = S.actions.filter(a => a.type !== 'Événement' && !a.journee_entiere && a.planifie_debut && !['Annulé'].includes(a.statut) && cleJour(a.planifie_debut) === auj)
      .map(a => [...plage(a, auj), a]).filter(([d, f]) => f > d);
    const occ = fusionner(evts.map(([d, f]) => [d, f]));
    const pris = occ.reduce((s, [d, f]) => s + f - d, 0);
    const tout = fusionner([...evts, ...blocs].map(([d, f]) => [d, f]));
    const maintenant = minutesLocales(new Date());
    const libres = []; let cur = Math.max(JOUR_DE, maintenant);
    for (const [d, f] of tout) { if (d - cur >= 30) libres.push([cur, d]); cur = Math.max(cur, f); }
    if (JOUR_A - cur >= 30) libres.push([cur, JOUR_A]);
    return { evts, blocs, occ, tout, pris, libres, maintenant, JOUR_DE, JOUR_A };
  }
  const hhmm = m => `${Math.floor(m / 60)} h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') : ''}`;
  function blocCharge() {
    const { occ, blocs, pris, libres, maintenant } = chargeDuJour();
    const pct = m => ((m - JOUR_DE) / (JOUR_A - JOUR_DE) * 100).toFixed(2);
    const fini = maintenant >= JOUR_A;
    const jourSem = new Date(aujourdhui() + 'T12:00:00').getDay();
    const finDeSemaine = jourSem === 0 || jourSem === 6;
    const texteLibre = finDeSemaine ? 'Fin de semaine' : fini ? 'Journée de travail terminée' : libres.length ? 'Libre : ' + libres.slice(0, 4).map(([d, f]) => `${hhmm(d)}–${hhmm(f)}`).join(' · ') : 'Aucune plage libre de 30 min d’ici 17 h';
    return `<div class="charge${finDeSemaine ? ' charge-fds' : ''}" title="${finDeSemaine ? 'Fin de semaine' : 'Plage de travail 8 h – 17 h'}">
      <div class="charge-texte"><b>${pris ? duree(pris) : '0 h'}</b> ${finDeSemaine ? 'd’événements (8 h–17 h)' : 'en rendez-vous (8 h–17 h)'} · <span>${esc(texteLibre)}</span>${blocs.length ? ` · <span>${blocs.length} bloc${blocs.length > 1 ? 's' : ''} planifié${blocs.length > 1 ? 's' : ''}</span>` : ''}</div>
      <div class="charge-barre" aria-hidden="true">${blocs.map(([d, f, a]) => `<i class="t${a.statut === 'Terminé' ? ' fait' : ''}" style="left:${pct(d)}%;width:${(pct(f) - pct(d)).toFixed(2)}%"></i>`).join('')}${occ.map(([d, f]) => `<i style="left:${pct(d)}%;width:${(pct(f) - pct(d)).toFixed(2)}%"></i>`).join('')}
        ${maintenant > JOUR_DE && maintenant < JOUR_A ? `<b style="left:${pct(maintenant)}%"></b>` : ''}</div>
      <div class="charge-graduations" aria-hidden="true"><span>8 h</span><span>10 h</span><span>12 h</span><span>14 h</span><span>17 h</span></div></div>`;
  }

  /* ================= 4. Compte rendu depuis un événement ================= */
  const MODELE_CR = 'Participants :\n\nPoints discutés :\n- \n\nDécisions :\n- \n\nActions (une par ligne, « - [ ] » devient une tâche) :\n- [ ] ';
  function noteDe(a) { return S.notes.find(n => n.action_id === a.id); }
  async function compteRendu(a) {
    let n = noteDe(a);
    if (!n) {
      const ligne = { titre: `CR — ${a.titre}`, type: 'Compte rendu', date: a.planifie_debut ? cleJour(a.planifie_debut) : aujourdhui(),
        projet_id: a.projet_id || null, domaine_id: a.domaine_id || null, action_id: a.id, contenu: MODELE_CR };
      const { data, error } = await sb.from('notes').insert(ligne).select('*').single();
      if (error) return toast('Échec : ' + error.message);
      S.notes.push(data); n = data;
    }
    c.ficheNote(n);
  }
  // Lignes « - [ ] … » du contenu : crée une tâche par ligne, puis les marque « - [→] ».
  async function creerActionsDepuisNote(n, contenu) {
    const lignes = (contenu || '').split('\n');
    const aCreer = lignes.map((l, i) => [i, l.match(/^\s*-\s*\[ \]\s*(.+\S)\s*$/)?.[1]]).filter(([, t]) => t);
    if (!aCreer.length) { toast('Aucune ligne « - [ ] … » à transformer'); return null; }
    const { error } = await sb.from('actions').insert(aCreer.map(([, titre]) => ({ titre, type: 'Tâche', statut: 'À faire', projet_id: n.projet_id || null, domaine_id: n.domaine_id || null, note_id: n.id, hors_projet: !n.projet_id })));
    if (error) { toast('Échec : ' + error.message); return null; }
    aCreer.forEach(([i]) => { lignes[i] = lignes[i].replace('[ ]', '[→]'); });
    const nouveau = lignes.join('\n');
    await sb.from('notes').update({ contenu: nouveau }).eq('id', n.id);
    toast(`${aCreer.length} tâche${aCreer.length > 1 ? 's' : ''} créée${aCreer.length > 1 ? 's' : ''}`);
    return nouveau;
  }

  /* ================= 5. Règles de classement ================= */
  function blocRegles() {
    const regles = (S.regles || []).slice().sort((a, b) => a.motif.localeCompare(b.motif));
    const projets = S.projets.filter(p => p.statut !== 'Terminé');
    const sansProjet = S.actions.filter(a => a.type === 'Événement' && !a.projet_id && ouvert(a)).length;
    return bloc('Classement automatique', regles.length, `<div class="reglage">
      <p>Quand le titre d’un événement contient un mot-clé, il est relié au projet. S’applique aux nouveaux événements importés ou saisis.</p>
      <ul class="lignes">${regles.map(r => `<li class="ligne" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="titre">« ${esc(r.motif)} »</div><div class="meta"><span>→ ${esc(parId(S.projets, r.projet_id)?.titre || '?')}</span></div></div><button class="btn discret" data-suppr-regle="${r.id}">Retirer</button></li>`).join('') || '<li class="ligne"><span class="aide">Aucune règle. Exemple : « GOMD » → projet GOMD.</span></li>'}</ul>
      <div class="rangee"><input id="motifRegle" placeholder="Mot-clé (ex. GOMD)" aria-label="Mot-clé" style="max-width:180px">
        <select id="projetRegle" aria-label="Projet">${projets.map(p => `<option value="${p.id}">${esc(p.titre)}</option>`).join('')}</select>
        <button class="btn primaire" id="ajRegle">Ajouter</button></div>
      <div class="rangee"><button class="btn" id="appRegles" ${regles.length ? '' : 'disabled'}>Appliquer aux événements existants</button><span class="aide">${sansProjet} événement${sansProjet > 1 ? 's' : ''} ouvert${sansProjet > 1 ? 's' : ''} sans projet</span></div></div>`);
  }
  function blocMoi() {
    const choix = [...new Set(['Papa', 'Maman', 'Mamie', ...S.trajets.map(t => t.responsable).filter(Boolean)])];
    return bloc('Transports', null, `<div class="reglage"><p>Qui es-tu dans les trajets? Sert à repérer les conflits avec ton agenda et à t’envoyer tes rappels de trajet.</p>
      <div class="rangee"><select id="moiTransport" aria-label="Moi dans les transports">${choix.map(r => `<option ${r === moi() ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div></div>`);
  }
  async function ecrire(cle, valeur) {
    const { error } = await sb.from('reglages').upsert({ cle, valeur });
    if (error) { toast('Échec : ' + error.message); return false; }
    return true;
  }
  function complementReglages(v) {
    const col = v.querySelectorAll('.grille > .colonne')[1] || v;
    col.insertAdjacentHTML('beforeend', blocRegles() + blocMoi());
    $('#ajRegle').onclick = async () => {
      const motif = $('#motifRegle').value.trim(), projet_id = $('#projetRegle').value;
      if (!motif || !projet_id) return toast('Indique un mot-clé et un projet');
      const { error } = await sb.from('regles_classement').insert({ motif, projet_id });
      if (error) return toast('Échec : ' + error.message);
      toast('Règle ajoutée'); rafraichir();
    };
    v.querySelectorAll('[data-suppr-regle]').forEach(b => b.onclick = async () => {
      const { error } = await sb.from('regles_classement').delete().eq('id', b.dataset.supprRegle);
      if (error) return toast('Échec : ' + error.message);
      toast('Règle retirée'); rafraichir();
    });
    $('#appRegles').onclick = async () => {
      const { data, error } = await sb.rpc('appliquer_regles_classement');
      if (error) return toast('Échec : ' + error.message);
      toast(`${data} événement${data > 1 ? 's' : ''} classé${data > 1 ? 's' : ''}`); rafraichir();
    };
    $('#moiTransport').onchange = async e => { if (await ecrire('moi_transport', e.target.value)) { toast('Enregistré'); rafraichir(); } };
  }

  /* ================= 6. Jalons et ligne de temps ================= */
  function blocLigneTemps(p) {
    const jalons = S.actions.filter(a => a.projet_id === p.id && a.type === 'Jalon' && a.statut !== 'Annulé')
      .map(a => ({ a, date: a.echeance || (a.planifie_debut && cleJour(a.planifie_debut)) })).sort((x, y) => (x.date || '9').localeCompare(y.date || '9'));
    const dates = jalons.map(j => j.date).filter(Boolean);
    const auj = aujourdhui();
    const bouton = `<button class="btn discret" data-ajjalon="${p.id}">Ajouter un jalon</button>`;
    if (!jalons.length && !p.debut && !p.cible) return bloc('Ligne de temps', null, vide('Ajoute une date de début, une cible ou des jalons au projet.'), bouton);
    const debut = [p.debut, ...dates].filter(Boolean).sort()[0] || auj;
    const fin = [p.cible, ...dates, plusJours(debut, 14)].filter(Boolean).sort().pop();
    const jours = d => Math.round((new Date(d + 'T12:00:00Z') - new Date(debut + 'T12:00:00Z')) / 864e5);
    const total = Math.max(1, jours(fin));
    const pos = d => Math.min(100, Math.max(0, jours(d) / total * 100)).toFixed(2);
    const etat = j => j.a.statut === 'Terminé' ? 'fait' : j.date && j.date < auj ? 'retard' : 'avenir';
    const avancement = auj <= debut ? 0 : auj >= fin ? 100 : +pos(auj);
    return bloc('Ligne de temps', jalons.length, `
      <div class="ligne-temps" role="img" aria-label="Du ${esc(jourDate(debut))} au ${esc(jourDate(fin))}, ${jalons.length} jalons">
        <div class="lt-axe"><div class="lt-ecoule" style="width:${avancement}%"></div>
          ${jalons.filter(j => j.date).map((j, i) => `<span class="lt-jalon ${etat(j)}" style="left:${pos(j.date)}%" title="${esc(j.a.titre)} · ${esc(jourDate(j.date))}">${i + 1}</span>`).join('')}
          ${auj > debut && auj < fin ? `<span class="lt-auj" style="left:${pos(auj)}%"><em>auj.</em></span>` : ''}</div>
        <div class="lt-bornes"><span>${p.debut ? 'Début ' : ''}${esc(jourDate(debut))}</span><span>${p.cible && fin === p.cible ? 'Cible ' : ''}${esc(jourDate(fin))}</span></div></div>
      <ul class="lignes">${jalons.map((j, i) => `<li class="ligne lt-ligne ${etat(j)}" data-ouvrir="${j.a.id}" role="button" tabindex="0"><span class="lt-num">${j.date ? i + 1 : '·'}</span>
        <div><div class="titre">${esc(j.a.titre)}</div><div class="meta"><span>${j.date ? esc(jourDate(j.date)) : 'Date à fixer'}</span>${etat(j) === 'retard' ? '<span class="retard">en retard</span>' : ''}${etat(j) === 'fait' ? '<span>atteint</span>' : ''}</div></div></li>`).join('') || '<li class="ligne"><span class="aide">Aucun jalon. Un jalon marque une étape clé : livraison, décision, mise en service.</span></li>'}</ul>`, bouton, 'bloc-ligne-temps');
  }
  function brancherLigneTemps(v, p) {
    v.querySelectorAll('[data-ajjalon]').forEach(b => b.onclick = () => c.ouvrirAction({ type: 'Jalon', statut: 'À faire', projet_id: p.id, domaine_id: p.domaine_id }));
    v.querySelectorAll('.lt-ligne[data-ouvrir]').forEach(el => { el.onclick = () => c.ouvrirAction(parId(S.actions, el.dataset.ouvrir)); el.onkeydown = e => { if (e.key === 'Enter') el.onclick(); }; });
  }

  /* ================= 8. Météo et pneus d'hiver ================= */
  // Au Québec, les pneus d'hiver sont obligatoires du 1er décembre au 15 mars.
  function alertePneus() {
    const auj = aujourdhui(), m = +auj.slice(5, 7), j = +auj.slice(8, 10);
    if (!(m === 10 || m === 11)) return null;
    const meteo = c.meteo();
    const froid = meteo && Math.min(meteo.t, meteo.ressenti ?? meteo.t) < 7;
    if (!froid && !(m === 11 && j >= 15)) return null;
    const vehicules = S.vehicules.filter(v => v.etat !== 'Vendu').filter(v => {
      const e = S.entretiens.find(x => x.vehicule_id === v.id && x.actif && x.pneus_poses === 'Hiver');
      if (!e) return false;
      const fait = S.interventions.some(i => i.vehicule_id === v.id && i.statut === 'Terminée' && i.date >= `${auj.slice(0, 4)}-09-01`
        && S.intEnt.some(x => x.intervention_id === i.id && x.entretien_id === e.id));
      return !fait;
    });
    if (!vehicules.length) return null;
    const restant = Math.round((new Date(`${auj.slice(0, 4)}-12-01T12:00:00Z`) - new Date(auj + 'T12:00:00Z')) / 864e5);
    return { vehicules, restant, temp: meteo ? Math.round(meteo.t) : null };
  }
  function encartPneus() {
    const a = alertePneus(); if (!a) return '';
    return `<div class="alerte-pneus" data-aller="vehicules" role="button" tabindex="0">
      <b>Pneus d’hiver</b> · ${a.temp != null ? `${a.temp}° dehors · ` : ''}obligatoires dans ${a.restant} jour${a.restant > 1 ? 's' : ''} (1er décembre)
      <span>${a.vehicules.map(v => esc(v.nom)).join(', ')} : prends rendez-vous</span></div>`;
  }

  /* ================= 9. Recherche globale ================= */
  const norm = s => (s || '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function sources() {
    return [
      ['Actions et événements', S.actions, a => [a.titre, a.notes, a.prochain_geste, a.reference_externe, a.lieu], a => a.titre, a => [a.type, a.planifie_debut ? jourDate(cleJour(a.planifie_debut)) : a.echeance ? 'Échéance ' + jourDate(a.echeance) : '', a.statut].filter(Boolean).join(' · '), a => c.ouvrirAction(a), a => ouvert(a) ? 0 : 1],
      ['Projets', S.projets, p => [p.titre, p.resultat_attendu, p.notes], p => p.titre, p => p.statut, p => { S.vue = 'projet'; S.projetId = p.id; c.rendre(); }],
      ['Personnes', S.personnes, p => [p.nom, p.courriel, p.fonction], p => p.nom, p => [p.fonction, p.courriel].filter(Boolean).join(' · '), p => c.ouvrirPersonne(p)],
      ['Notes', S.notes, n => [n.titre, n.contenu], n => n.titre, n => [n.type, n.date && jourDate(n.date)].filter(Boolean).join(' · '), n => c.ficheNote(n)],
      ['Budget', S.budget, b => [b.poste, b.lot, b.fournisseur, b.notes], b => b.poste, b => [parId(S.projets, b.projet_id)?.titre, b.lot].filter(Boolean).join(' · '), b => { S.vue = 'projet'; S.projetId = b.projet_id; c.rendre(); }],
      ['Achats', S.achats, a => [a.item, a.magasin, a.reference, a.notes], a => a.item, a => [a.statut, a.magasin].filter(Boolean).join(' · '), a => c.ficheAchat(a)],
      ['Livres', S.livres, l => [l.titre, l.auteur], l => l.titre, l => [l.auteur, l.statut].filter(Boolean).join(' · '), () => aller('bibliotheque')],
      ['Abonnements', S.abonnements, a => [a.nom, a.notes], a => a.nom, a => a.statut, () => aller('abonnements')],
      ['Véhicules', S.vehicules, v => [v.nom, v.marque, v.modele, v.immatriculation], v => v.nom, v => [v.marque, v.modele].filter(Boolean).join(' '), () => aller('vehicules')],
    ];
  }
  function aller(vue) { S.vue = vue; S.filtres = {}; c.rendre(); }
  function chercher(q) {
    const mots = norm(q).split(/\s+/).filter(Boolean);
    if (!mots.length) return [];
    return sources().map(([groupe, items, champs, titre, detail, ouvrir, rang]) => {
      const res = items.filter(x => { const t = norm(champs(x).join(' ')); return mots.every(m => t.includes(m)); })
        .map(x => ({ x, titre: titre(x), detail: detail(x), ouvrir, score: (norm(titre(x)).startsWith(mots[0]) ? 0 : norm(titre(x)).includes(mots[0]) ? 1 : 2) + (rang ? rang(x) : 0) }))
        .sort((a, b) => a.score - b.score);
      return { groupe, total: res.length, res: res.slice(0, 6) };
    }).filter(g => g.total);
  }
  function surligner(txt, q) {
    let h = esc(txt);
    norm(q).split(/\s+/).filter(m => m.length > 1).forEach(m => {
      const i = norm(txt).indexOf(m); if (i < 0) return;
      const brut = txt.slice(i, i + m.length); h = h.replace(esc(brut), `<mark>${esc(brut)}</mark>`);
    });
    return h;
  }
  function ouvrirRecherche() {
    if (document.querySelector('dialog.recherche')) return;
    const d = dialogue(`<form class="form-recherche" role="search">
      <div class="tete-d"><input type="search" name="q" id="rq" placeholder="Chercher partout : tâche, personne, note, poste…" autocomplete="off" aria-label="Chercher partout" autofocus>
        <button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps resultats" id="rres" role="listbox"><p class="aide">Tape au moins deux lettres. Entrée ouvre le premier résultat · Échap ferme.</p></div>
    </form>`, () => { const p = d.querySelector('[data-r]'); if (p) p.click(); return false; });
    d.classList.add('recherche');
    const inp = d.querySelector('#rq'), zone = d.querySelector('#rres');
    let actuels = [];
    const dessiner = () => {
      const q = inp.value.trim();
      if (q.length < 2) { zone.innerHTML = '<p class="aide">Tape au moins deux lettres. Entrée ouvre le premier résultat · Échap ferme.</p>'; actuels = []; return; }
      const groupes = chercher(q); actuels = [];
      zone.innerHTML = groupes.length ? groupes.map(g => `<div class="groupe-res"><h3>${esc(g.groupe)} <span class="nb">${g.total}</span></h3>${g.res.map(r => { actuels.push(r); return `<button type="button" class="res" role="option" data-r="${actuels.length - 1}"><span class="titre">${surligner(r.titre || '(sans titre)', q)}</span><span class="meta">${esc(r.detail || '')}</span></button>`; }).join('')}</div>`).join('')
        : `<p class="aide">Rien trouvé pour « ${esc(q)} ».</p>`;
      zone.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { const r = actuels[+b.dataset.r]; d.close(); r.ouvrir(r.x); });
    };
    inp.oninput = dessiner;
    inp.onkeydown = e => { if (e.key === 'ArrowDown') { e.preventDefault(); zone.querySelector('[data-r]')?.focus(); } if (e.key === 'Escape') { e.preventDefault(); d.close(); } };
    zone.onkeydown = e => {
      const tous = [...zone.querySelectorAll('[data-r]')], i = tous.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && i < tous.length - 1) { e.preventDefault(); tous[i + 1].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? tous[i - 1] : inp).focus(); }
    };
    inp.focus();
  }

  return { conflitDe, blocConflits, brancherConflits, blocCharge, chargeDuJour, minutesLocales, noteDe, compteRendu, creerActionsDepuisNote, complementReglages,
    blocLigneTemps, brancherLigneTemps, encartPneus, alertePneus, ouvrirRecherche };
}
