// ORBITE · Lot 8
// 1. Raccourcis de date « Aujourd’hui » et « Demain » sous les champs de date des nouvelles tâches.
// 2. Projets : vue Kanban, regroupée selon le critère choisi (statut, domaine, santé, priorité, échéance cible…).
//    Glisser une carte vers une autre colonne change ce critère sur le projet (sauf santé et échéance, qui sont calculées).
export function installerLot8(c) {
  const { sb, S, esc, toast, parId, aujourdhui, plusJours, rafraichir, rendre, carteProjet, sante, STATUTS_PROJET, PRIOS } = c;

  /* ================= 1. Raccourcis de date ================= */
  // Boutons placés sous un champ date (attribut name = nom). Ils remplissent le champ du même formulaire
  // et déclenchent ses événements, comme une saisie à la main.
  const RACCOURCIS = [['Aujourd’hui', 0], ['Demain', 1]];
  const boutonsDate = nom => `<div class="raccourcis-date" role="group" aria-label="Raccourcis de date">${RACCOURCIS.map(([l, n]) =>
    `<button type="button" class="puce-date" data-date-pour="${nom}" data-jours="${n}" aria-pressed="false">${l}</button>`).join('')}</div>`;
  function marquer(form) {
    form.querySelectorAll('[data-date-pour]').forEach(b => {
      const champ = form.querySelector(`[name="${b.dataset.datePour}"]`);
      b.setAttribute('aria-pressed', String(!!champ && champ.value === plusJours(aujourdhui(), +b.dataset.jours)));
    });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-date-pour]'); if (!b) return;
    const form = b.closest('form'), champ = form?.querySelector(`[name="${b.dataset.datePour}"]`); if (!champ) return;
    const date = plusJours(aujourdhui(), +b.dataset.jours);
    champ.value = champ.value === date ? '' : date; // un 2e toucher sur le même bouton efface la date
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.dispatchEvent(new Event('change', { bubbles: true }));
  });
  document.addEventListener('input', e => { const f = e.target.closest?.('form'); if (f && f.querySelector('[data-date-pour]')) marquer(f); });
  // À l’ouverture d’un dialogue, l’état des boutons reflète la date déjà saisie.
  new MutationObserver(() => document.querySelectorAll('dialog[open] form').forEach(f => { if (f.querySelector('[data-date-pour]') && !f.dataset.datesMarquees) { f.dataset.datesMarquees = '1'; marquer(f); } }))
    .observe(document.body, { childList: true });

  /* ================= 2. Kanban des projets ================= */
  // Chaque regroupement : les colonnes (clé, libellé), la clé d’un projet, et le champ modifié par un glisser (null = calculé).
  const nomDomaine = id => parId(S.domaines, id)?.nom;
  const finMois = j => { const d = new Date(j + 'T12:00:00'); return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).toISOString().slice(0, 10); };
  const GROUPES = {
    statut: { l: 'Statut', champ: 'statut',
      colonnes: () => STATUTS_PROJET.filter(s => !['Terminé', 'Annulé'].includes(s) || S.filtres.kanbanTermines).map(s => [s, s]),
      cle: p => p.statut },
    domaine: { l: 'Domaine', champ: 'domaine_id',
      colonnes: () => [...S.domaines.filter(d => d.actif !== false).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)).map(d => [d.id, d.nom]), ['', 'Sans domaine']],
      cle: p => p.domaine_id || '', interdit: k => k === '' && 'Un projet doit avoir un domaine' },
    sante: { l: 'Santé', champ: null, aide: 'La santé est calculée à partir des tâches et des dates : ouvre le projet pour agir.',
      colonnes: () => [['ko', 'En retard'], ['risque', 'À surveiller'], ['ok', 'En santé'], ['neutre', 'Sans tâches']], cle: p => sante(p) },
    priorite: { l: 'Priorité', champ: 'priorite',
      colonnes: () => [...Object.entries(PRIOS).map(([k, l]) => [k, l]), ['', 'Sans priorité']], cle: p => p.priorite ? String(p.priorite) : '', valeur: k => k ? +k : null },
    cible: { l: 'Échéance cible', champ: null, aide: 'Classé selon la date cible : change-la dans la fiche du projet.',
      colonnes: () => [['retard', 'Dépassée'], ['mois', 'Ce mois-ci'], ['trimestre', 'D’ici 3 mois'], ['plus', 'Plus tard'], ['', 'Sans cible']],
      cle: p => { const a = aujourdhui(); if (!p.cible) return ''; if (p.cible < a) return 'retard'; if (p.cible <= finMois(a)) return 'mois'; return p.cible <= plusJours(a, 92) ? 'trimestre' : 'plus'; } },
    responsable: { l: 'Responsable', champ: 'responsable_id',
      colonnes: () => [...[...new Set(projetsAffiches().map(p => p.responsable_id).filter(Boolean))].map(id => [id, parId(S.personnes, id)?.nom || 'Personne retirée'])
        .sort((a, b) => a[1].localeCompare(b[1], 'fr')), ['', 'Sans responsable']], cle: p => p.responsable_id || '' },
    nature: { l: 'Nature', champ: 'nature', colonnes: () => [['Projet ponctuel', 'Projet ponctuel'], ['Amélioration continue', 'Amélioration continue']], cle: p => p.nature },
    niveau: { l: 'Niveau', champ: 'niveau', colonnes: () => [['Objectif', 'Objectif'], ['Projet', 'Projet'], ['Sous-projet', 'Sous-projet']], cle: p => p.niveau },
  };
  // Choix d’affichage gardé dans le réglage `projets_affichage` = { mode: 'cartes' | 'kanban', groupe } (suit le compte).
  const affichage = () => ({ mode: 'cartes', groupe: 'statut', ...(S.reglages.find(r => r.cle === 'projets_affichage')?.valeur || {}) });
  async function enregistrerAffichage(maj) {
    const val = { ...affichage(), ...maj };
    const r = S.reglages.find(x => x.cle === 'projets_affichage');
    if (r) r.valeur = val; else S.reglages.push({ cle: 'projets_affichage', valeur: val });
    rendre();
    const { error } = await sb.from('reglages').upsert({ cle: 'projets_affichage', valeur: val });
    if (error) toast('Affichage non enregistré : ' + error.message);
  }
  // Projets visibles : filtre de statut des onglets, sauf en regroupement par statut (les colonnes font office de filtre).
  function projetsAffiches() {
    const { groupe } = affichage(), f = S.filtres.statutProjet || 'Actif';
    if (groupe === 'statut') return S.projets.filter(p => S.filtres.kanbanTermines || !['Terminé', 'Annulé'].includes(p.statut));
    return S.projets.filter(p => f === 'tous' || p.statut === f);
  }
  const tri = (a, b) => (a.priorite ?? 9) - (b.priorite ?? 9) || (a.cible || '9999').localeCompare(b.cible || '9999') || a.titre.localeCompare(b.titre, 'fr');

  function barreAffichage() {
    const a = affichage();
    return `<div class="barre-affichage"><div class="onglets" role="group" aria-label="Affichage"><button data-mode-proj="cartes" aria-pressed="${a.mode === 'cartes'}">Cartes</button><button data-mode-proj="kanban" aria-pressed="${a.mode === 'kanban'}">Kanban</button></div>
      ${a.mode === 'kanban' ? `<label class="choix-groupe"><span>Regrouper par</span><select id="groupeKanban">${Object.entries(GROUPES).map(([k, g]) => `<option value="${k}" ${k === a.groupe ? 'selected' : ''}>${g.l}</option>`).join('')}</select></label>
        ${a.groupe === 'statut' ? `<label class="champ case"><input type="checkbox" id="kanbanTermines" ${S.filtres.kanbanTermines ? 'checked' : ''}><span>Inclure terminés et annulés</span></label>` : ''}` : ''}</div>`;
  }
  function kanban() {
    const a = affichage(), g = GROUPES[a.groupe] || GROUPES.statut;
    const projets = projetsAffiches(), cols = g.colonnes();
    const parCol = Object.fromEntries(cols.map(([k]) => [k, []]));
    projets.forEach(p => { const k = g.cle(p) ?? ''; (parCol[k] ||= []).push(p); });
    // Valeur sans colonne prévue (ex. ancien statut) : colonne ajoutée pour ne rien cacher.
    Object.keys(parCol).filter(k => !cols.some(([x]) => x === k)).forEach(k => cols.push([k, k || 'Non précisé']));
    const deplacable = !!g.champ;
    return `${g.aide ? `<p class="aide aide-kanban">${esc(g.aide)}</p>` : deplacable ? '<p class="aide aide-kanban">Glisse une carte vers une autre colonne pour changer ce critère (sur téléphone : appui long, puis glisse). Toucher une carte ouvre le projet.</p>' : ''}
      <div class="kanban kanban-projets" data-groupe="${esc(a.groupe)}" ${deplacable ? 'data-deplacable' : ''} style="--nb-col:${cols.length}">
      ${cols.map(([k, l]) => {
        const ps = (parCol[k] || []).sort(tri);
        return `<div class="kanban-col" data-col="${esc(k)}" ${a.groupe === 'sante' ? `data-sante="${esc(k)}"` : ''} role="group" aria-label="${esc(l)} : ${ps.length} projet${ps.length > 1 ? 's' : ''}">
          <h3>${a.groupe === 'sante' ? `<span class="sante ${esc(k)}" aria-hidden="true"></span>` : ''}${esc(l)} <span class="nb">${ps.length}</span></h3>
          <div class="kanban-cartes">${ps.map(carteProjet).join('') || '<div class="vide">Aucun</div>'}</div></div>`;
      }).join('')}</div>`;
  }
  function brancherProjets(v) {
    v.querySelectorAll('[data-mode-proj]').forEach(b => b.onclick = () => enregistrerAffichage({ mode: b.dataset.modeProj }));
    const gk = v.querySelector('#groupeKanban'); if (gk) gk.onchange = () => enregistrerAffichage({ groupe: gk.value });
    const kt = v.querySelector('#kanbanTermines'); if (kt) kt.onchange = () => { S.filtres.kanbanTermines = kt.checked; rendre(); };
    const k = v.querySelector('.kanban-projets[data-deplacable]'); if (k) brancherGlisser(k);
  }

  /* ---------- Glisser une carte de projet ---------- */
  // Souris : on glisse dès 6 px de mouvement. Tactile : appui long (350 ms) puis on glisse; un mouvement avant défile normalement.
  let glisse = null;
  document.addEventListener('touchmove', e => { if (glisse?.actif) e.preventDefault(); }, { passive: false });
  function brancherGlisser(k) {
    k.querySelectorAll('.projet[data-projet]').forEach(carte => {
      carte.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const g = glisse = { carte, id: carte.dataset.projet, x: e.clientX, y: e.clientY, actif: false, tactile: e.pointerType !== 'mouse', minuterie: null };
        if (g.tactile) g.minuterie = setTimeout(() => demarrer(g, e.clientX, e.clientY), 350);
        const bouge = ev => {
          if (glisse !== g) return;
          const dist = Math.hypot(ev.clientX - g.x, ev.clientY - g.y);
          if (!g.actif) {
            if (g.tactile) { if (dist > 8) { clearTimeout(g.minuterie); fin(); } return; } // l’utilisateur défile
            if (dist > 6) demarrer(g, ev.clientX, ev.clientY); else return;
          }
          suivre(g, ev.clientX, ev.clientY);
        };
        const fin = async ev => {
          clearTimeout(g.minuterie);
          window.removeEventListener('pointermove', bouge); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin);
          if (glisse !== g) return;
          glisse = null;
          if (!g.actif) return;
          g.fantome.remove(); g.carte.classList.remove('en-glisse'); k.classList.remove('glisse-actif'); k.querySelectorAll('.cible-depot').forEach(x => x.classList.remove('cible-depot'));
          // Le clic qui suit un glisser ne doit pas ouvrir le projet.
          const bloque = x => { x.stopImmediatePropagation(); x.preventDefault(); };
          g.carte.addEventListener('click', bloque, { capture: true, once: true });
          setTimeout(() => g.carte.removeEventListener('click', bloque, { capture: true }), 400);
          if (ev?.type === 'pointerup' && g.col) await deposer(g.id, g.col.dataset.col);
        };
        window.addEventListener('pointermove', bouge); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
      });
    });
    function demarrer(g, x, y) {
      if (glisse !== g) return;
      g.actif = true;
      navigator.vibrate?.(15);
      const r = g.carte.getBoundingClientRect();
      g.dx = x - r.left; g.dy = y - r.top;
      g.fantome = g.carte.cloneNode(true); g.fantome.classList.add('fantome-projet'); g.fantome.style.width = r.width + 'px';
      document.body.appendChild(g.fantome);
      g.carte.classList.add('en-glisse'); k.classList.add('glisse-actif');
      suivre(g, x, y);
    }
    function suivre(g, x, y) {
      g.fantome.style.transform = `translate(${x - g.dx}px, ${y - g.dy}px)`;
      // Défilement automatique près des bords (colonnes hors écran sur téléphone).
      const r = k.getBoundingClientRect();
      if (x < r.left + 40) k.scrollLeft -= 14; else if (x > r.right - 40) k.scrollLeft += 14;
      g.fantome.style.visibility = 'hidden';
      const col = document.elementFromPoint(x, y)?.closest('.kanban-col');
      g.fantome.style.visibility = '';
      if (col !== g.col) { g.col?.classList.remove('cible-depot'); g.col = col && k.contains(col) ? col : null; g.col?.classList.add('cible-depot'); }
    }
  }
  async function deposer(id, col) {
    const a = affichage(), g = GROUPES[a.groupe], p = parId(S.projets, id);
    if (!g?.champ || !p || (g.cle(p) ?? '') === col) return;
    const non = g.interdit?.(col); if (non) return toast(non);
    const valeur = g.valeur ? g.valeur(col) : (col || null);
    const { error } = await sb.from('projets').update({ [g.champ]: valeur }).eq('id', id);
    if (error) return toast('Échec : ' + error.message);
    const lib = g.colonnes().find(([x]) => x === col)?.[1] || col;
    toast(`${p.titre} → ${lib}`); rafraichir();
  }

  return { boutonsDate, barreAffichage, kanban, affichage, projetsAffiches, brancherProjets, GROUPES };
}
