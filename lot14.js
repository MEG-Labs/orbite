// ORBITE · Lot 14 : tâche en pleine page, pour documenter.
// Un clic sur une tâche ouvre toujours l’aperçu centré (fenêtre). Depuis l’aperçu, « ⤢ Pleine page » l’ouvre dans son
// propre onglet; Ctrl+clic, Cmd+clic ou clic du milieu sur une tâche l’ouvre directement en pleine page, en arrière-plan.
// Une tâche n’a qu’un onglet : l’ouvrir une 2e fois va à l’onglet déjà ouvert.
// Mise en page : à gauche la documentation (champ Notes de la tâche, avec l’éditeur visuel des notes), à droite les mêmes
// champs que l’aperçu (statut, dates, répétition, relier, détails, maintenance) et les notes et cahiers liés.
// Enregistrement automatique 0,8 s après la dernière modification (et avant de changer d’onglet ou de quitter), comme les
// notes. Seuls les champs modifiés sont envoyés : ce que le serveur calcule de son côté (chrono, durée réelle) n’est
// jamais écrasé. Le texte reste du Markdown dans `actions.notes` : aucune migration SQL.
export function installerLot14(c) {
  const { sb, S, esc, toast, parId, fmtHeure, rafraichir, ouvert } = c;
  const rendre = () => c.rendre();
  const O9 = () => c.onglets();     // onglets (lot 9)
  const E = () => c.editeur();      // éditeur visuel (lot 9)
  const brouillons = {};            // id → { ligne, erreur, titre, notes } en attente d’enregistrement (survit à un nouveau rendu)
  let page = null;                  // { id, ver, timer, enCours, encore, racine }

  /* ---------- Ouvrir ---------- */
  function ouvrir(id, { arrierePlan = false } = {}) {
    if (!id || !parId(S.actions, id)) return toast('Tâche introuvable');
    const o = O9(), ex = o.onglets().find(t => t.vue === 'tache' && t.actionId === id);
    if (ex) { if (!arrierePlan) o.activer(ex.id); return; }
    // origine : l’onglet d’où la page est ouverte; « ✕ Fermer » y revient.
    o.ouvrir({ vue: 'tache', actionId: id, origine: o.ongletActif() }, { arrierePlan });
  }
  const titre = id => brouillons[id]?.titre?.trim() || null;

  /* ---------- Comparaison (pour n’envoyer que ce qui a changé) ---------- */
  const vide = x => x == null || x === '' || (Array.isArray(x) && !x.length);
  const trie = x => Array.isArray(x) ? x.map(trie) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, trie(x[k])])) : x;
  const RE_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
  function pareil(x, y) {
    if (vide(x) && vide(y)) return true;
    if (typeof x === 'string' && typeof y === 'string' && RE_TS.test(x) && RE_TS.test(y)) return new Date(x).getTime() === new Date(y).getTime();
    if (typeof x === 'object' || typeof y === 'object') return JSON.stringify(trie(x)) === JSON.stringify(trie(y));
    return String(x) === String(y);
  }

  /* ---------- Page ---------- */
  function vueTache(v) {
    const id = S.actionId, base = parId(S.actions, id);
    if (!base) {
      v.innerHTML = `<section class="bloc"><header><h2>Tâche introuvable</h2><button class="btn" data-vers-actions>Actions</button></header>
        <div class="vide">Cette tâche a été supprimée ou n’est pas encore chargée.</div></section>`;
      v.querySelector('[data-vers-actions]').onclick = () => { S.vue = 'actions'; S.actionId = null; rendre(); };
      return;
    }
    if (!page || page.id !== id) page = { id, ver: 0, timer: null, enCours: null, encore: false };
    const br = brouillons[id] || {};
    const a = { ...base, ...(br.ligne || {}), titre: br.titre ?? base.titre, notes: br.notes ?? base.notes };
    const evt = a.type === 'Événement';
    v.innerHTML = `<article class="page-tache">
      <div class="barre-note">
        <button type="button" class="btn discret" data-fermer-page title="Fermer cette page et revenir à l’onglet d’où elle a été ouverte">✕ Fermer</button>
        <span class="etat-note" aria-live="polite" title="S’enregistre toute seule 0,8 s après ta dernière modification (Ctrl+S pour tout de suite)">${brouillons[id] ? 'Modifications non enregistrées…' : 'Enregistrée'}</span>
        <div class="boutons-entete">
          ${evt ? `<button type="button" class="btn" data-cr title="Note de rencontre : préparation en haut, compte rendu en bas">${esc(c.libRencontre(a))}</button>` : ''}
          ${a.note_id && parId(S.notes, a.note_id) ? '<button type="button" class="btn discret" data-note-origine>Note d’origine</button>' : ''}
          ${a.recurrence && ouvert(base) ? '<button type="button" class="btn" data-sauter title="Passer à l’occurrence suivante sans marquer celle-ci comme faite">Sauter cette fois</button>' : ''}
          <button type="button" class="btn danger" data-suppr>Supprimer</button>
        </div>
      </div>
      <form class="form-tache" novalidate autocomplete="off">
        <div class="ref-tache">Action #${esc(a.ref ?? '')}</div>
        <input class="titre-note" name="titre" value="${esc(a.titre)}" placeholder="Titre de la tâche" aria-label="Titre de la tâche" required>
        <div class="colonnes-tache">
          <section class="doc-tache" aria-label="Documentation">
            <h2 class="etiquette-doc">Documentation <span class="aide">· champ Notes de la tâche</span></h2>
            ${E().barreEtEditeur(a.notes, 'Documentation de la tâche (champ Notes)')}
          </section>
          <aside class="champs-tache" aria-label="Propriétés de la tâche">
            ${c.champsAction(a, { page: true })}
            <div class="champ large notes-liees">${c.notesLiees().blocNotesLiees({ action_id: id })}</div>
          </aside>
        </div>
      </form>
    </article>`;
    brancher(v, base);
  }

  function brancher(v, base) {
    const pg = page; pg.racine = v;
    const f = v.querySelector('form.form-tache'), ed = v.querySelector('.editeur-note');
    // Comportements des champs (mêmes que l’aperçu), avertissement « processus de quelqu’un d’autre », raccourcis de date.
    c.brancherChampsAction(v, base);
    c.avertBac(v);
    f.querySelector('[name=jour]')?.dispatchEvent(new Event('input', { bubbles: true })); // marque « Aujourd’hui / Demain » (lot 8)
    // Toute modification : brouillon + enregistrement différé. L’éditeur signale les siennes lui-même.
    const surChamp = e => { if (!e.target.closest('.editeur-note')) modifie(); };
    f.addEventListener('input', surChamp); f.addEventListener('change', surChamp);
    f.addEventListener('submit', e => { e.preventDefault(); lancer(); }); // Entrée dans un champ = enregistrer tout de suite
    E().brancherEditeur(v, ed, modifie);
    v.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); lancer(); } });

    v.querySelector('[data-fermer-page]').onclick = () => fermerPage();
    const cr = v.querySelector('[data-cr]'); if (cr) cr.onclick = () => { avantRendre(); c.compteRendu(parId(S.actions, pg.id)); };
    const no = v.querySelector('[data-note-origine]'); if (no) no.onclick = () => { avantRendre(); c.ouvrirNote(parId(S.notes, base.note_id)); };
    const sa = v.querySelector('[data-sauter]');
    if (sa) sa.onclick = async () => {
      sa.disabled = true; await vider();
      const { error } = await sb.rpc('sauter_occurrence', { p_id: pg.id });
      if (error) { sa.disabled = false; return toast('Échec : ' + error.message); }
      await rafraichir(); c.annoncerSuivante(pg.id, 'Sautée');
    };
    const s = v.querySelector('[data-suppr]');
    s.onclick = async () => {
      if (s.dataset.confirme !== '1') { s.dataset.confirme = '1'; s.textContent = 'Confirmer la suppression'; return; }
      clearTimeout(pg.timer); delete brouillons[pg.id];
      const { error } = await sb.from('actions').delete().eq('id', pg.id);
      if (error) return toast('Échec : ' + error.message);
      S.actions = S.actions.filter(x => x.id !== pg.id); page = null;
      toast('Supprimé'); fermerPage({ sansEnregistrer: true }); rafraichir();
    };
    const nl = v.querySelector('.notes-liees');
    if (nl) c.notesLiees().brancherNotesLiees(nl, { action_id: base.id, projet_id: base.projet_id || null, domaine_id: base.domaine_id || null, titre: base.titre, avant: avantRendre });
  }

  function fermerPage({ sansEnregistrer = false } = {}) {
    if (!sansEnregistrer) avantRendre();
    const o = O9(), t = o.onglets().find(x => x.id === o.ongletActif());
    if (t) o.fermer(t.id, { force: true, vers: t.origine });
  }

  /* ---------- Enregistrement automatique ---------- */
  function etat(txt, erreur = false) { const e = document.querySelector('.page-tache .etat-note'); if (e) { e.textContent = txt; e.classList.toggle('erreur', erreur); } }
  // Lit la page : la ligne `actions` (même règle que l’aperçu : realisee_le, répétition, Promis à…), le titre et la documentation.
  function capture(pg) {
    const v = pg.racine, f = v?.querySelector('form.form-tache'), ed = v?.querySelector('.editeur-note');
    if (!f || !ed) return brouillons[pg.id];
    const fd = new FormData(f), notes = E().htmlVersMd(ed);
    fd.set('notes', notes);
    const t = (fd.get('titre') || '').trim();
    const r = t ? c.lireLigneAction(fd, parId(S.actions, pg.id) || {}) : {};
    return { ligne: r.ligne, erreur: r.erreur, titre: fd.get('titre') || '', notes };
  }
  function modifie() {
    const pg = page; if (!pg?.racine?.isConnected) return;
    brouillons[pg.id] = capture(pg); pg.ver++;
    etat('Modifications…');
    clearTimeout(pg.timer); pg.timer = setTimeout(lancer, 800);
    majTitreOnglet(pg.id);
  }
  function majTitreOnglet(id) {
    const o = O9(), t = o.onglets().find(x => x.vue === 'tache' && x.actionId === id);
    const el = t && document.querySelector(`[data-onglet="${t.id}"] span`);
    if (el) el.textContent = titre(id) || parId(S.actions, id)?.titre || 'Tâche';
  }
  function lancer() {
    const pg = page; if (!pg) return Promise.resolve();
    clearTimeout(pg.timer); pg.timer = null;
    if (pg.enCours) { pg.encore = true; return pg.enCours; }
    pg.enCours = enregistrer(pg).finally(() => { pg.enCours = null; if (pg.encore) { pg.encore = false; if (page === pg) lancer(); } });
    return pg.enCours;
  }
  const vider = () => (page?.timer || page?.enCours ? lancer() : Promise.resolve());
  async function enregistrer(pg) {
    const br = brouillons[pg.id]; if (!br) return;
    const ver = pg.ver;
    if (!br.titre.trim()) { etat('Titre requis : rien n’est enregistré tant que le titre est vide', true); return; }
    if (br.erreur || !br.ligne) { etat('Non enregistrée : ' + (br.erreur || 'champ invalide'), true); return; }
    const base = parId(S.actions, pg.id);
    if (!base) { etat('Non enregistrée : cette tâche n’existe plus (supprimée ailleurs?)', true); return; }
    const diff = {};
    Object.entries(br.ligne).forEach(([k, val]) => { if (!pareil(val, base[k])) diff[k] = val; });
    if (!Object.keys(diff).length) { if (pg.ver === ver) delete brouillons[pg.id]; etat(`Enregistrée à ${fmtHeure.format(new Date())}`); return; }
    etat('Enregistrement…');
    const { data, error } = await sb.from('actions').update(diff).eq('id', pg.id).select('*').single();
    if (error) { etat('Non enregistrée : ' + error.message, true); return; }
    const avant = base.statut;
    Object.assign(parId(S.actions, pg.id) || base, data);
    if (pg.ver === ver) {
      delete brouillons[pg.id];
      // Valeurs calculées par le serveur ou par la répétition (durée réelle à la sortie de « En cours », 1re échéance) : affichées.
      ['duree_reelle_min', 'echeance'].forEach(k => {
        const ch = pg.racine?.isConnected && pg.racine.querySelector(`[name="${k}"]`);
        if (ch && document.activeElement !== ch && String(data[k] ?? '') !== ch.value) ch.value = data[k] ?? '';
      });
    }
    if (page === pg) etat(`Enregistrée à ${fmtHeure.format(new Date())}`);
    if ('titre' in diff) O9().majBarre();
    if (diff.statut === 'Terminé' && avant !== 'Terminé' && data.recurrence) { await rafraichir(); c.annoncerSuivante(pg.id, 'Terminé'); }
  }
  // Avant tout nouveau rendu (changement d’onglet, de module…) et en quittant : on enregistre ce qui attend.
  function avantRendre() { if (page?.timer) lancer(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) avantRendre(); });
  window.addEventListener('pagehide', avantRendre);

  return { vues: { tache: vueTache }, ouvrir, avantRendre, titre };
}
