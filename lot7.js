// ORBITE · Lot 7 : ne plus perdre le fil.
// 1. Engagements : ce que J’AI promis aux autres (colonne actions.promis_a_id), par personne.
// 2. Reprise : à chaque interruption (touche I), noter où j’étais rendu avant de répondre; bandeau « ↩ Reprendre » ensuite.
// 3. Registre des décisions : lu dans le Carnet (notes de type Décision et sections « Décisions : » des comptes rendus).
// 4. Dictée : bouton micro sur les champs de saisie rapide (Chrome Android et ordinateur).
export function installerLot7(c) {
  const { sb, S, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, rafraichir, rendre, liste, ouvert, enRetard } = c;
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const vide = m => `<div class="vide">${m}</div>`;
  const reglage = (k, defaut = null) => S.reglages.find(r => r.cle === k)?.valeur ?? defaut;
  async function ecrireReglage(cle, valeur) {
    const r = S.reglages.find(x => x.cle === cle);
    if (r) r.valeur = valeur; else S.reglages.push({ cle, valeur });
    const { error } = await sb.from('reglages').upsert({ cle, valeur });
    return !error;
  }
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  // La migration 20261113_engagements.sql ajoute actions.promis_a_id. Sans elle, les promesses restent désactivées.
  const colonnePromis = () => !S.actions.length || 'promis_a_id' in S.actions[0];

  /* ================= Personnes : retrouver quelqu’un par son nom ================= */
  // Sans accents ni majuscules. Correspondance exacte, sinon un prénom ou un début de nom qui ne désigne qu’une personne.
  const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  function personneParNom(txt) {
    const n = norm(txt); if (!n) return null;
    const exact = S.personnes.filter(p => norm(p.nom) === n);
    if (exact.length === 1) return exact[0];
    const partiel = S.personnes.filter(p => { const pn = norm(p.nom); return pn.startsWith(n + ' ') || pn.split(' ')[0] === n; });
    return partiel.length === 1 ? partiel[0] : null;
  }

  /* ================= 1. Engagements (mes promesses) ================= */
  // Une promesse = une tâche ouverte avec « Promis à », ou une interruption « à faire plus tard » avec un demandeur.
  const estPromesse = a => a.type !== 'Événement' && (a.promis_a_id || (a.interruption && a.demandeur));
  const promessesOuvertes = () => S.actions.filter(a => ouvert(a) && estPromesse(a));
  const clePromesse = a => a.promis_a_id ? 'p:' + a.promis_a_id : 'd:' + norm(a.demandeur);
  const nomCle = (k, a) => k.startsWith('p:') ? (parId(S.personnes, k.slice(2))?.nom || 'Personne retirée') : a.demandeur;
  const triEcheance = (a, b) => (a.echeance || '9999').localeCompare(b.echeance || '9999') || (a.priorite ?? 3) - (b.priorite ?? 3);
  // Ce que cette personne me doit (délégué ou en attente), pour voir les deux côtés avant une rencontre.
  const ilMeDoit = id => S.actions.filter(a => ouvert(a) && (a.delegue_a_id === id || a.en_attente_de_id === id)).length;

  function courrielSuivi(p, items) {
    const prenom = p?.nom?.split(' ')[0] || '';
    const lignes = items.map(a => `- ${a.titre}${a.echeance ? ` (d’ici le ${jourDate(a.echeance)})` : ''}`).join('\n');
    const corps = `Bonjour ${prenom},\n\nPetit point sur ce que je dois te livrer :\n${lignes}\n\nJe te reviens dès que c’est fait. Dis-moi si une priorité a changé.\n\nMerci,\nMarc-Étienne`;
    return `mailto:${encodeURIComponent(p?.courriel || '')}?subject=${encodeURIComponent('Suivi de mes engagements')}&body=${encodeURIComponent(corps)}`;
  }

  function vuePromesses() {
    const auj = aujourdhui(), il7 = plusJours(auj, -7);
    const items = promessesOuvertes();
    const retard = items.filter(enRetard).length, sansDate = items.filter(a => !a.echeance).length;
    const groupes = {};
    items.forEach(a => { (groupes[clePromesse(a)] ||= []).push(a); });
    const cles = Object.keys(groupes).sort((x, y) => groupes[y].some(enRetard) - groupes[x].some(enRetard)
      || (groupes[x].map(a => a.echeance || '9999').sort()[0]).localeCompare(groupes[y].map(a => a.echeance || '9999').sort()[0]));
    const tenues = S.actions.filter(a => a.statut === 'Terminé' && estPromesse(a) && a.realisee_le && cleJour(a.realisee_le) >= il7)
      .sort((a, b) => b.realisee_le.localeCompare(a.realisee_le));
    const sousTitre = items.length
      ? `${pluriel(items.length, 'promesse')} ouverte${items.length > 1 ? 's' : ''}${retard ? ` · <span class="retard">${retard} en retard</span>` : ''}${sansDate ? ` · ${sansDate} sans date promise` : ''}. ${pluriel(tenues.length, 'tenue')} ces 7 derniers jours.`
      : 'Aucune promesse ouverte.';
    const corps = cles.length ? cles.map(k => {
      const g = groupes[k].sort(triEcheance), p = k.startsWith('p:') ? parId(S.personnes, k.slice(2)) : null;
      const doit = p ? ilMeDoit(p.id) : 0;
      const actions = `<div class="boutons-entete">${doit ? `<button class="btn discret" data-aller-deleg title="Ce que ${esc(p.nom)} me doit">Me doit ${doit}</button>` : ''}${p?.courriel ? `<a class="btn" href="${courrielSuivi(p, g)}">Courriel de suivi</a>` : ''}</div>`;
      return bloc(esc(nomCle(k, g[0])), g.length, liste(g, '', { montrerPromis: false }), actions, g.some(enRetard) ? 'signal' : '');
    }).join('') : bloc('Mes promesses', 0, vide(`Rien de promis pour l’instant. Trois façons d’ajouter une promesse :<br>
      · Capture rapide (N ou +) : choisis « Promis à ».<br>
      · Interruption (I) : choisis « À faire plus tard ».<br>
      · Compte rendu : écris « - [ ] Envoyer le rapport → Jean-Pierre ».`));
    return { sous: sousTitre, html: corps + (tenues.length ? bloc('Tenues · 7 derniers jours', tenues.length, liste(tenues.slice(0, 15), '')) : '')
      + (sansDate ? `<p class="aide note-engagements">Une promesse sans date est celle qu’on oublie. Ouvre-la et donne-lui une échéance.</p>` : '') };
  }

  /* ================= 3. Registre des décisions ================= */
  // Lu à même le Carnet, sans copie : modifier un compte rendu met le registre à jour.
  // Sources : notes de type « Décision »; lignes « - … » sous un titre « Décisions : »; toute ligne « Décision : … ».
  function decisionsDe(n) {
    if (n.archivee) return [];
    const res = [];
    if (n.type === 'Décision') res.push({ texte: n.titre, n });
    const lignes = (n.contenu || '').split('\n');
    let dans = false;
    for (const l of lignes) {
      if (/^\s*d[ée]cisions?\s*:?\s*$/i.test(l)) { dans = true; continue; }
      const enLigne = l.match(/^\s*(?:[-*•]\s*)?d[ée]cision\s*:\s*(.+\S)\s*$/i);
      if (enLigne) { res.push({ texte: enLigne[1], n }); continue; }
      if (!dans) continue;
      const puce = l.match(/^\s*[-*•]\s*(?!\[)(.+\S)\s*$/);
      if (puce) { res.push({ texte: puce[1], n }); continue; }
      if (/^\S.*:\s*$/.test(l)) dans = false; // titre de la section suivante (« Actions : »…)
    }
    return res;
  }
  function vueDecisions() {
    const f = S.filtres, q = norm(f.qd), pid = f.projetDec || '';
    const toutes = S.notes.flatMap(decisionsDe)
      .filter(d => (!pid || d.n.projet_id === pid) && (!q || norm(d.texte + ' ' + d.n.titre).includes(q)))
      .sort((a, b) => (b.n.date || '').localeCompare(a.n.date || '') || (b.n.cree_le || '').localeCompare(a.n.cree_le || ''));
    const projets = [...new Set(S.notes.flatMap(decisionsDe).map(d => d.n.projet_id).filter(Boolean))].map(id => parId(S.projets, id)).filter(Boolean)
      .sort((a, b) => a.titre.localeCompare(b.titre));
    const lignes = toutes.map(d => {
      const p = parId(S.projets, d.n.projet_id);
      return `<li class="ligne decision" data-note-dec="${d.n.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto"><div>
        <div class="titre">${esc(d.texte.charAt(0).toUpperCase() + d.texte.slice(1))}</div>
        <div class="meta">${p ? `<span>${esc(p.titre)}</span>` : ''}<span>${esc(d.n.type === 'Décision' ? 'Note de décision' : d.n.titre)}</span></div></div>
        <div class="droite">${d.n.date ? esc(jourDate(d.n.date)) : ''}</div></li>`;
    }).join('');
    return `<div class="outils"><input type="search" id="qd" placeholder="Chercher une décision" value="${esc(f.qd || '')}" aria-label="Chercher une décision">
        <select id="projetDec" aria-label="Projet"><option value="">Tous les projets</option>${projets.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.titre)}</option>`).join('')}</select></div>
      ${bloc(pluriel(toutes.length, 'décision'), null, toutes.length ? `<ul class="lignes">${lignes}</ul>` : vide(q || pid ? 'Aucune décision pour ces filtres.'
        : 'Aucune décision consignée. Dans un compte rendu, écris chaque décision sur une ligne « - » sous « Décisions : », ou une ligne « Décision : … » dans n’importe quelle note.'))}`;
  }

  function vueEngagements(v) {
    const onglet = S.filtres.onglet === 'decisions' ? 'decisions' : 'promesses';
    const { sous, html: corps } = onglet === 'promesses' ? vuePromesses()
      : { sous: 'Les décisions prises en réunion, lues dans le Carnet. Toucher une décision ouvre sa note.', html: vueDecisions() };
    v.innerHTML = `<div class="entete-vue"><div><h1>${onglet === 'promesses' ? 'Ce que j’ai promis' : 'Registre des décisions'}</h1><p class="sous-titre">${sous}</p></div>
      <div class="onglets" role="tablist"><button data-onglet="promesses" aria-pressed="${onglet === 'promesses'}">Mes promesses</button><button data-onglet="decisions" aria-pressed="${onglet === 'decisions'}">Décisions</button></div></div>
      ${!colonnePromis() && onglet === 'promesses' ? `<div class="bloc signal"><header><h2>Migration à exécuter</h2></header>${vide('Exécute supabase/migrations/20261113_engagements.sql dans Supabase › SQL Editor pour activer « Promis à ».')}</div>` : ''}
      ${corps}`;
    v.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => { S.filtres = { onglet: b.dataset.onglet }; rendre(); });
    v.querySelectorAll('[data-aller-deleg]').forEach(b => b.onclick = () => { S.vue = 'delegations'; S.filtres = {}; history.replaceState(null, '', '#delegations'); rendre(); window.scrollTo(0, 0); });
    v.querySelectorAll('[data-note-dec]').forEach(el => {
      const go = () => c.ficheNote(parId(S.notes, el.dataset.noteDec));
      el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
    });
    const qd = v.querySelector('#qd');
    if (qd) qd.oninput = () => { clearTimeout(vueEngagements.t); vueEngagements.t = setTimeout(() => { S.filtres.qd = qd.value; const p = qd.selectionStart; rendre(); const n = document.querySelector('#qd'); n.focus(); n.setSelectionRange(p, p); }, 200); };
    const pd = v.querySelector('#projetDec'); if (pd) pd.onchange = () => { S.filtres.projetDec = pd.value; rendre(); };
  }

  /* ---------- Encadré d’accueil : promesses à tenir ---------- */
  // En retard ou dues d’ici 7 jours (les promesses sans date sont comptées à part).
  function encartPromesses() {
    const auj = aujourdhui(), dans7 = plusJours(auj, 7);
    const toutes = promessesOuvertes().filter(c.visible || (() => true));
    const proches = toutes.filter(a => a.echeance && a.echeance <= dans7).sort(triEcheance);
    const sansDate = toutes.filter(a => !a.echeance).length;
    if (!proches.length && !sansDate) return '';
    return bloc('Promesses à tenir · 7 jours', proches.length,
      (proches.length ? liste(proches, '') : vide('Aucune promesse due cette semaine.'))
      + (sansDate ? `<div class="pied-bloc"><span class="aide">${pluriel(sansDate, 'promesse')} sans date promise</span></div>` : ''),
      '<button class="btn discret" data-aller="engagements">Tout voir</button>', proches.some(enRetard) ? 'signal' : '');
  }

  /* ---------- Bloc de la revue hebdo ---------- */
  function blocRevue() {
    const items = promessesOuvertes(), il7 = plusJours(aujourdhui(), -7);
    const retard = items.filter(enRetard).sort(triEcheance), sansDate = items.filter(a => !a.echeance);
    const tenues = S.actions.filter(a => a.statut === 'Terminé' && estPromesse(a) && a.realisee_le && cleJour(a.realisee_le) >= il7).length;
    return bloc('🤝 Promesses', items.length, `<div class="reglage"><p>${pluriel(tenues, 'promesse')} tenue${tenues > 1 ? 's' : ''} cette semaine. ${retard.length ? `<span class="retard">${retard.length} en retard</span> : avertis la personne ou renégocie la date.` : 'Aucune en retard.'}${sansDate.length ? ` ${sansDate.length} sans date : donne-leur une échéance.` : ''}</p></div>`
      + (retard.length || sansDate.length ? liste([...retard, ...sansDate].slice(0, 12), '') : ''),
      '<button class="btn discret" data-aller="engagements">Engagements</button>', retard.length ? 'signal' : '');
  }

  /* ================= 2. Reprise après une interruption ================= */
  // Réglage `reprise` = { action_id, le } : la tâche à reprendre (suit le compte sur tous les appareils), valable le jour même.
  function aReprendre() {
    const r = reglage('reprise');
    if (!r?.action_id || !r.le || cleJour(r.le) !== aujourdhui()) return null;
    const a = parId(S.actions, r.action_id);
    return a && ouvert(a) ? a : null;
  }
  function bandeauReprise() {
    const a = aReprendre(); if (!a) return '';
    return `<div class="bandeau-reprise" role="status"><div><b>↩ Reprendre</b> <span class="titre-reprise">${esc(a.titre)}</span>${a.prochain_geste ? `<span class="geste-reprise">▸ ${esc(a.prochain_geste)}</span>` : ''}</div>
      <div class="boutons-entete"><button class="btn discret" data-reprise-ouvrir>Ouvrir</button><button class="btn primaire" data-reprise-ok>C’est repris</button></div></div>`;
  }
  // Tâches proposées : en cours, puis plan du jour, puis le reste du backlog (les plus urgentes).
  function candidatsReprise() {
    const auj = aujourdhui();
    const ouvertes = S.actions.filter(a => ouvert(a) && !['Événement', 'Routine'].includes(a.type) && !a.interruption);
    const enCours = ouvertes.filter(a => a.statut === 'En cours').sort(triEcheance);
    const plan = ouvertes.filter(a => a.plan_du_jour === auj && a.statut !== 'En cours');
    const reste = ouvertes.filter(a => !enCours.includes(a) && !plan.includes(a) && ['À faire', 'À traiter'].includes(a.statut)).sort(triEcheance).slice(0, 12);
    return { enCours, plan, reste, defaut: enCours[0] || plan[0] || null };
  }
  function htmlReprise() {
    const { enCours, plan, reste, defaut } = candidatsReprise();
    const opt = a => `<option value="${a.id}" ${a === defaut ? 'selected' : ''}>${esc(a.titre)}</option>`;
    const groupe = (lib, l) => l.length ? `<optgroup label="${lib}">${l.map(opt).join('')}</optgroup>` : '';
    return `<fieldset class="champ large bloc-reprise"><legend>Avant de répondre : tu étais rendu où?</legend>
      <label class="champ large"><span>Tâche en cours</span><select name="reprise_action"><option value="">Je n’étais sur rien</option>${groupe('En cours', enCours)}${groupe('Aujourd’hui, je fais', plan)}${groupe('Backlog', reste)}</select></label>
      <label class="champ large champ-geste-reprise"><span>Prochain geste (une ligne)</span><input name="reprise_geste" autocomplete="off" data-dictee value="${esc(defaut?.prochain_geste || '')}" placeholder="Ex. Valider la colonne G du fichier tarifs"></label>
    </fieldset>`;
  }
  function brancherReprise(d) {
    const sel = d.querySelector('[name=reprise_action]'), geste = d.querySelector('[name=reprise_geste]');
    if (!sel) return;
    const maj = () => {
      const a = parId(S.actions, sel.value);
      geste.closest('.champ').hidden = !a;
      geste.value = a?.prochain_geste || '';
    };
    sel.onchange = maj;
    geste.closest('.champ').hidden = !sel.value;
  }
  // Enregistre le prochain geste sur la tâche et la marque « à reprendre ». Renvoie { a, geste } ou null.
  async function enregistrerReprise(fd) {
    const a = parId(S.actions, fd.get('reprise_action'));
    if (!a) return null;
    const geste = (fd.get('reprise_geste') || '').trim() || null;
    try {
      if (geste !== (a.prochain_geste || null)) await sb.from('actions').update({ prochain_geste: geste }).eq('id', a.id);
      await ecrireReglage('reprise', { action_id: a.id, le: new Date().toISOString() });
    } catch { return null; }
    return { a, geste };
  }

  /* ================= 4. Dictée vocale ================= */
  // Chrome (Android et ordinateur) offre la reconnaissance vocale : un bouton micro s’ajoute aux champs de saisie rapide.
  // Le son est traité par le service de reconnaissance de Chrome (Google), comme la dictée du clavier Gboard.
  const Reco = window.SpeechRecognition || window.webkitSpeechRecognition;
  function brancherDictee(racine) {
    if (!Reco) return;
    racine.querySelectorAll('input.titre-saisie, input[data-dictee]').forEach(input => {
      if (input.parentElement.classList.contains('saisie-dictee')) return;
      const enveloppe = document.createElement('span'); enveloppe.className = 'saisie-dictee';
      input.replaceWith(enveloppe); enveloppe.appendChild(input);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn-micro'; b.setAttribute('aria-label', 'Dicter'); b.title = 'Dicter';
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
      enveloppe.appendChild(b);
      let reco = null;
      b.onclick = e => {
        e.preventDefault();
        if (reco) { reco.stop(); return; }
        const base = input.value.trim();
        reco = new Reco(); reco.lang = 'fr-CA'; reco.interimResults = true; reco.maxAlternatives = 1;
        reco.onresult = ev => {
          const t = [...ev.results].map(r => r[0].transcript).join(' ').trim();
          input.value = (base ? base + ' ' : '') + t.charAt(0).toUpperCase() + t.slice(1);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        reco.onerror = ev => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('Micro refusé : autorise-le pour ORBITE dans Chrome'); else if (ev.error === 'network') toast('Dictée indisponible sans réseau'); };
        reco.onend = () => { reco = null; b.classList.remove('ecoute'); b.setAttribute('aria-label', 'Dicter'); input.focus(); };
        b.classList.add('ecoute'); b.setAttribute('aria-label', 'Arrêter la dictée');
        try { reco.start(); } catch { reco = null; b.classList.remove('ecoute'); }
      };
    });
  }

  /* ================= Branchements ================= */
  // Bouton « Engagements » dans la revue hebdo et l’accueil (l’accueil branche déjà ses [data-aller]).
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-aller="engagements"]');
    if (!b || S.vue === 'engagements') return;
    S.vue = 'engagements'; S.filtres = {}; history.replaceState(null, '', '#engagements'); rendre(); window.scrollTo(0, 0);
  });
  function brancher(v) {
    v.querySelectorAll('[data-reprise-ouvrir]').forEach(b => b.onclick = () => { const a = aReprendre(); if (a) c.ouvrirAction(a); });
    v.querySelectorAll('[data-reprise-ok]').forEach(b => b.onclick = async () => {
      const a = aReprendre(); b.disabled = true;
      if (a && ['À faire', 'À traiter'].includes(a.statut)) await sb.from('actions').update({ statut: 'En cours' }).eq('id', a.id);
      await ecrireReglage('reprise', null);
      toast('Bon retour sur ta tâche'); rafraichir();
    });
  }

  return { vues: { engagements: vueEngagements }, colonnePromis, personneParNom, encartPromesses, blocRevue,
    bandeauReprise, htmlReprise, brancherReprise, enregistrerReprise, brancherDictee, brancher };
}
