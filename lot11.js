// ORBITE · Lot 11 (migration supabase/migrations/20261124_bacs_plancher_feuille.sql)
// 1. Bacs à sable : à qui appartient chaque processus de l’équipe (avec l’historique des propriétaires),
//    et un avertissement quand le titre d’une tâche ou d’un projet touche au processus de quelqu’un d’autre.
// 2. « Je pars sur le plancher » : pop-up pour choisir les tâches à mettre en pause (décocher celle qu’on va
//    faire sur le plancher : son chrono continue), bandeau « Sur le plancher », « De retour » pour les relancer.
// 3. Feuille de temps : la journée minute par minute (séances de chrono, interruptions, fly, réunions, plancher),
//    totaux par tâche, ligne du temps, copie pour Excel et CSV, correction d’une séance.
export function installerLot11(c) {
  const { sb, S, esc, toast, parId, dialogue, rendre, rafraichir, aujourdhui, plusJours, cleJour, jourLong, fmtHeure, ouvrirAction, depuisLocal, versLocal } = c;
  S.bacs = S.bacs || []; S.bacsHist = S.bacsHist || []; S.lot11 = false;
  const reglage = (k, d = null) => S.reglages.find(r => r.cle === k)?.valeur ?? d;
  async function ecrireReglage(cle, valeur) {
    const { error } = await sb.from('reglages').upsert({ cle, valeur });
    if (error) { toast('Échec : ' + error.message); return false; }
    const r = S.reglages.find(x => x.cle === cle); if (r) r.valeur = valeur; else S.reglages.push({ cle, valeur });
    return true;
  }
  const dureeTxt = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const heure = iso => fmtHeure.format(new Date(iso));
  const minutesEntre = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 6e4));
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const vide = m => `<div class="vide">${m}</div>`;

  // Chargé après les autres données. Sans la migration, tout le lot reste caché (rien ne plante).
  async function charger() {
    try {
      const [b, h] = await Promise.all([sb.from('bacs_sable').select('*').order('nom'), sb.from('bacs_sable_historique').select('*').order('fin', { ascending: false })]);
      if (b.error) { S.lot11 = !!S.bacs.length && /fetch|network/i.test(b.error.message || ''); return; }
      S.bacs = b.data || []; S.bacsHist = h.data || []; S.lot11 = true;
    } catch { S.lot11 = !!S.bacs.length; }
  }

  /* ================= Qui suis-je (pour « mes » bacs à sable) ================= */
  // Réglage `moi_personne` (id d’une fiche de Parties prenantes); choisi dans Bacs à sable.
  const moi = () => parId(S.personnes, reglage('moi_personne')) || null;
  const personnesTriees = () => S.personnes.filter(p => p.nature !== 'Organisation').sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  /* ================= 1. Bacs à sable ================= */
  const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const motsDe = b => [b.nom, ...(b.mots_cles || [])].map(norm).map(x => x.trim()).filter(x => x.length >= 3);
  // Bacs à sable dont un mot-clé (ou le nom) paraît dans le texte, comme mot entier.
  function bacsTouches(texte) {
    const t = ' ' + norm(texte).replace(/[^a-z0-9]+/g, ' ') + ' ';
    if (t.trim().length < 3) return [];
    return S.bacs.filter(b => b.actif !== false && motsDe(b).some(m => t.includes(' ' + m.replace(/[^a-z0-9]+/g, ' ').trim() + ' ')));
  }
  const nomProprio = b => parId(S.personnes, b.proprietaire_id)?.nom || 'Sans propriétaire';
  function htmlAvert(texte) {
    const m = moi();
    const autres = bacsTouches(texte).filter(b => !m || b.proprietaire_id !== m.id);
    if (!autres.length) return '';
    return `⚠ Touche au processus ${autres.map(b => `« ${esc(b.nom)} » de <b>${esc(nomProprio(b))}</b>`).join(', ')}. Vérifie avec ${autres.length > 1 ? 'eux' : 'cette personne'} avant d’y toucher.`;
  }
  // À brancher sur un formulaire qui a un champ titre (capture rapide, fiche d’une action, fiche d’un projet).
  function brancherAvert(d) {
    if (!S.lot11 || !S.bacs.length) return;
    const ch = d.querySelector('[name=titre]'); if (!ch) return;
    const p = document.createElement('p'); p.className = 'avert-bac'; p.setAttribute('aria-live', 'polite');
    (ch.closest('label') || ch).insertAdjacentElement('afterend', p);
    const maj = () => { const h = htmlAvert(ch.value); p.innerHTML = h; p.hidden = !h; };
    ch.addEventListener('input', maj); maj();
  }

  function vueBacs(v) {
    if (!S.lot11) { v.innerHTML = `<div class="entete-vue"><div><h1>Bacs à sable</h1></div></div>${bloc('Migration à exécuter', null, vide('Exécute <code>supabase/migrations/20261124_bacs_plancher_feuille.sql</code> dans Supabase › SQL Editor, puis recharge ORBITE.'))}`; return; }
    const f = S.filtres, q = norm(f.q || ''), m = moi();
    let bacs = S.bacs.filter(b => f.inactifs || b.actif !== false);
    if (f.proprio === 'aucun') bacs = bacs.filter(b => !b.proprietaire_id); else if (f.proprio) bacs = bacs.filter(b => b.proprietaire_id === f.proprio);
    if (q) bacs = bacs.filter(b => norm([b.nom, b.description, (b.mots_cles || []).join(' '), nomProprio(b)].join(' ')).includes(q));
    // Regroupés par propriétaire : moi d’abord, puis par nom, « Sans propriétaire » à la fin.
    const groupes = new Map();
    bacs.forEach(b => { const k = b.proprietaire_id || ''; if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(b); });
    const cles = [...groupes.keys()].sort((a, b) => (b === m?.id) - (a === m?.id) || (!a) - (!b) || (parId(S.personnes, a)?.nom || '').localeCompare(parId(S.personnes, b)?.nom || '', 'fr'));
    const proprios = [...new Set(S.bacs.map(b => b.proprietaire_id).filter(Boolean))].map(id => parId(S.personnes, id)).filter(Boolean).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const carte = b => `<li class="ligne bac${b.actif === false ? ' ferme' : ''}" data-bac="${b.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto">
      <div><div class="titre">${esc(b.nom)}${b.actif === false ? ' <span class="pastille">Inactif</span>' : ''}</div>
        ${b.description ? `<div class="geste" style="opacity:1">${esc(b.description)}</div>` : ''}
        ${(b.mots_cles || []).length ? `<div class="meta">${b.mots_cles.map(k => `<span class="pastille">${esc(k)}</span>`).join('')}</div>` : ''}</div>
      <div class="droite">depuis ${esc(c.jourDate(b.depuis))}${S.bacsHist.some(h => h.bac_id === b.id) ? '<br>↺ passation' : ''}</div></li>`;
    v.innerHTML = `<div class="entete-vue"><div><h1>Bacs à sable</h1><p class="sous-titre">À qui appartient chaque processus de l’équipe. Avant de toucher à un processus, vérifie ici : ORBITE t’avertit aussi quand le titre d’une tâche ou d’un projet en parle.</p></div>
        <div class="boutons-entete"><button class="btn primaire" id="nouveauBac">Nouveau bac à sable</button></div></div>
      <div class="outils"><input type="search" id="qBac" placeholder="Chercher un processus, un mot-clé, une personne…" value="${esc(f.q || '')}" aria-label="Chercher">
        <select id="fProprio" aria-label="Propriétaire"><option value="">Tous les propriétaires</option>${proprios.map(p => `<option value="${p.id}" ${f.proprio === p.id ? 'selected' : ''}>${esc(p.nom)}${p.id === m?.id ? ' (toi)' : ''}</option>`).join('')}<option value="aucun" ${f.proprio === 'aucun' ? 'selected' : ''}>Sans propriétaire</option></select>
        <label class="champ case"><input type="checkbox" id="fInactifs" ${f.inactifs ? 'checked' : ''}><span>Inclure les inactifs</span></label>
        <label class="moi-bac"><span>Je suis</span><select id="moiBac"><option value="">— Choisis ta fiche</option>${personnesTriees().map(p => `<option value="${p.id}" ${p.id === m?.id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></label></div>
      ${!m ? `<div class="avert" style="margin-bottom:14px">Choisis « Je suis » : tes propres processus ne déclencheront pas d’avertissement.</div>` : ''}
      ${cles.length ? cles.map(k => bloc(k ? `${esc(parId(S.personnes, k)?.nom || 'Personne supprimée')}${k === m?.id ? ' <span class="nb">(toi)</span>' : ''}` : 'Sans propriétaire', groupes.get(k).length,
        `<ul class="lignes">${groupes.get(k).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(carte).join('')}</ul>`)).join('')
        : bloc('Aucun bac à sable', null, vide(S.bacs.length ? 'Aucun résultat pour ce filtre.' : 'Ajoute le premier : par exemple « Amélioration continue » → Yan, mots-clés « amélioration, kaizen ».'))}`;
    const q_ = v.querySelector('#qBac');
    q_.oninput = () => { S.filtres.q = q_.value; const pos = q_.selectionStart; rendre(); const n = document.querySelector('#qBac'); n.focus(); n.setSelectionRange(pos, pos); };
    v.querySelector('#fProprio').onchange = e => { S.filtres.proprio = e.target.value; rendre(); };
    v.querySelector('#fInactifs').onchange = e => { S.filtres.inactifs = e.target.checked; rendre(); };
    v.querySelector('#moiBac').onchange = async e => { if (e.target.value && await ecrireReglage('moi_personne', e.target.value)) { toast('Noté : tes processus n’avertiront pas'); rendre(); } };
    v.querySelector('#nouveauBac').onclick = () => ficheBac({ actif: true, proprietaire_id: S.filtres.proprio && S.filtres.proprio !== 'aucun' ? S.filtres.proprio : null });
    v.querySelectorAll('[data-bac]').forEach(el => { const go = () => ficheBac(parId(S.bacs, el.dataset.bac)); el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  }

  function ficheBac(b) {
    const nouveau = !b.id;
    const hist = S.bacsHist.filter(h => h.bac_id === b.id);
    const d = dialogue(`<form>
      <div class="tete-d"><h2>${nouveau ? 'Nouveau bac à sable' : esc(b.nom)}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">
        <label class="champ large"><span>Processus</span><input name="nom" required autocomplete="off" value="${esc(b.nom || '')}" placeholder="Ex. Amélioration continue"></label>
        <label class="champ"><span>Propriétaire</span><select name="proprietaire_id"><option value="">— Sans propriétaire</option>${personnesTriees().map(p => `<option value="${p.id}" ${p.id === b.proprietaire_id ? 'selected' : ''}>${esc(p.nom)}</option>`).join('')}</select></label>
        <label class="champ case"><input type="checkbox" name="actif" ${b.actif !== false ? 'checked' : ''}><span>Actif</span></label>
        <label class="champ large"><span>Périmètre (ce qui en fait partie, ce qui n’en fait pas partie)</span><textarea name="description" rows="3">${esc(b.description || '')}</textarea></label>
        <label class="champ large"><span>Mots-clés (séparés par des virgules)</span><input name="mots_cles" autocomplete="off" value="${esc((b.mots_cles || []).join(', '))}" placeholder="Ex. amélioration, kaizen, 5S">
          <p class="aide" style="margin:4px 0 0">Le nom et ces mots (3 lettres et plus, accents ignorés) déclenchent l’avertissement dans le titre d’une tâche ou d’un projet.</p></label>
        ${nouveau ? '' : `<div class="champ large"><span>Propriétaires</span><ul class="historique-bac">
          <li><b>${esc(nomProprio(b))}</b> depuis le ${esc(c.jourDate(b.depuis))} <span class="aide">(actuel)</span></li>
          ${hist.map(h => `<li>${esc(parId(S.personnes, h.proprietaire_id)?.nom || h.proprietaire_nom || 'Personne supprimée')} · ${h.debut ? 'du ' + esc(c.jourDate(h.debut)) + ' ' : ''}au ${esc(c.jourDate(h.fin))}</li>`).join('')}
        </ul><p class="aide" style="margin:4px 0 0">Changer le propriétaire ajoute l’ancien à cet historique automatiquement.</p></div>`}
      </div>
      <div class="pied">${nouveau ? '' : '<button type="button" class="btn danger gauche" data-suppr>Supprimer</button>'}
        <button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div>
    </form>`, async fd => {
      const ligne = { nom: fd.get('nom').trim(), proprietaire_id: fd.get('proprietaire_id') || null, actif: fd.get('actif') === 'on',
        description: (fd.get('description') || '').trim() || null,
        mots_cles: [...new Set((fd.get('mots_cles') || '').split(',').map(x => x.trim()).filter(Boolean))] };
      const dup = S.bacs.find(x => x.id !== b.id && norm(x.nom) === norm(ligne.nom));
      if (dup) { toast(`« ${dup.nom} » existe déjà (${nomProprio(dup)})`); return false; }
      const r = nouveau ? await sb.from('bacs_sable').insert(ligne) : await sb.from('bacs_sable').update(ligne).eq('id', b.id);
      if (r.error) { toast('Échec : ' + r.error.message); return false; }
      toast(!nouveau && ligne.proprietaire_id !== b.proprietaire_id ? `Passation notée : ${parId(S.personnes, ligne.proprietaire_id)?.nom || 'sans propriétaire'}` : 'Enregistré');
      rafraichir();
    });
    const s = d.querySelector('[data-suppr]');
    if (s) s.onclick = async () => {
      if (s.dataset.ok !== '1') { s.dataset.ok = '1'; s.textContent = 'Confirmer (historique compris)'; return; }
      const { error } = await sb.from('bacs_sable').delete().eq('id', b.id);
      if (error) return toast('Échec : ' + error.message);
      d.close(); toast('Supprimé'); rafraichir();
    };
  }
  // Fiche d’une personne : ses bacs à sable (encart ajouté par app.js si présent).
  const bacsDe = idPers => S.bacs.filter(b => b.proprietaire_id === idPers && b.actif !== false);

  /* ================= 2. Sur le plancher ================= */
  // Réglage `plancher` = { depuis, pauses: [ids des tâches mises en pause au départ], note } (depuis null = au bureau).
  const plancher = () => { const p = reglage('plancher'); return p?.depuis ? p : null; };
  const enMarche = () => S.actions.filter(a => a.statut === 'En cours' && a.type !== 'Événement').sort((a, b) => (a.chrono_debut || '').localeCompare(b.chrono_debut || ''));
  function boutonPlancher() {
    if (!S.lot11) return '';
    const p = plancher();
    return p
      ? `<button type="button" class="btn-plancher actif" data-plancher title="Sur le plancher depuis ${esc(heure(p.depuis))} · cliquer au retour"><span aria-hidden="true">🚶</span><span class="lib">Plancher · <b data-plancher-min>${esc(dureeTxt(minutesEntre(p.depuis, new Date())))}</b></span></button>`
      : `<button type="button" class="btn-plancher" data-plancher title="Je quitte mon bureau pour le plancher (P)"><span aria-hidden="true">🚶</span><span class="lib">Plancher</span></button>`;
  }
  function bandeauPlancher() {
    const p = plancher(); if (!p) return '';
    const restees = enMarche();
    return `<div class="bandeau-plancher" role="status"><div><b>🚶 Sur le plancher</b> depuis ${esc(heure(p.depuis))} · <span data-plancher-min>${esc(dureeTxt(minutesEntre(p.depuis, new Date())))}</span>${p.note ? ` · <i>${esc(p.note)}</i>` : ''}
      ${restees.length ? `<span class="aide-plancher">Chrono qui continue : ${restees.map(a => esc(a.titre)).join(', ')}</span>` : ''}</div>
      <button class="btn primaire" data-plancher>De retour</button></div>`;
  }
  function brancherPlancher(racine = document) {
    racine.querySelectorAll('[data-plancher]').forEach(b => b.onclick = () => plancher() ? retour() : partir());
  }
  setInterval(() => { const p = plancher(); if (p) document.querySelectorAll('[data-plancher-min]').forEach(el => { el.textContent = dureeTxt(minutesEntre(p.depuis, new Date())); }); }, 30e3);

  function partir() {
    const taches = enMarche();
    const d = dialogue(`<form>
      <div class="tete-d"><h2>🚶 Je pars sur le plancher</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">
        ${taches.length ? `<div class="champ large"><span>Mettre en pause ces tâches en cours?</span>
          <p class="aide" style="margin:0 0 6px">Décoche une tâche si c’est elle que tu vas faire sur le plancher (ou ailleurs) : son chrono continue.</p>
          <ul class="choix-plancher">${taches.map(a => `<li><label class="champ case"><input type="checkbox" name="pause" value="${a.id}" checked><span>${esc(a.titre)}${a.chrono_debut ? ` <small class="aide">· chrono depuis ${esc(heure(a.chrono_debut))}</small>` : ''}</span></label></li>`).join('')}</ul></div>`
          : '<p class="champ large aide" style="margin:0">Aucune tâche en cours : rien à mettre en pause. Le temps sur le plancher sera noté dans ta feuille de temps.</p>'}
        <label class="champ large"><span>Où / pourquoi (facultatif)</span><input name="note" autocomplete="off" placeholder="Ex. Réception, quai 4 : problème de RF"></label>
      </div>
      <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Confirmer : je pars</button></div>
    </form>`, async fd => {
      const ids = fd.getAll('pause');
      for (const id of ids) {
        const { error } = await sb.from('actions').update({ statut: 'En pause' }).eq('id', id);
        if (error) { toast('Échec : ' + error.message); return false; }
      }
      if (!await ecrireReglage('plancher', { depuis: new Date().toISOString(), pauses: ids, note: (fd.get('note') || '').trim() || null })) return false;
      const continuent = taches.length - ids.length;
      toast(`🚶 Bon plancher${ids.length ? ` · ${ids.length} en pause` : ''}${continuent ? ` · ${continuent} chrono${continuent > 1 ? 's' : ''} continue${continuent > 1 ? 'nt' : ''}` : ''}`);
      rafraichir();
    });
    d.classList.add('petit');
  }
  function retour() {
    const p = plancher(); if (!p) return;
    const fin = new Date().toISOString(), min = minutesEntre(p.depuis, fin);
    const pausees = (p.pauses || []).map(id => parId(S.actions, id)).filter(a => a && a.statut === 'En pause');
    const d = dialogue(`<form>
      <div class="tete-d"><h2>De retour au bureau</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">
        <p class="champ large" style="margin:0">Sur le plancher de <b>${esc(heure(p.depuis))}</b> à <b>${esc(heure(fin))}</b> · <b>${esc(dureeTxt(min))}</b>${p.note ? ` · ${esc(p.note)}` : ''}.${min > 0 ? ' Noté dans ta feuille de temps.' : ' Moins d’une minute : rien à noter.'}</p>
        ${pausees.length ? `<div class="champ large"><span>Relancer les tâches mises en pause au départ?</span><ul class="choix-plancher">${pausees.map(a => `<li><label class="champ case"><input type="checkbox" name="relancer" value="${a.id}" checked><span>${esc(a.titre)}</span></label></li>`).join('')}</ul></div>` : ''}
      </div>
      <div class="pied"><button type="button" class="btn danger gauche" id="oublierPlancher" title="Ne rien noter dans la feuille de temps">Oublier cette sortie</button><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Je suis de retour</button></div>
    </form>`, async fd => {
      if (min > 0) {
        const { error } = await sb.from('seances').insert({ type: 'plancher', debut: p.depuis, fin, note: p.note || null });
        if (error) { toast('Échec : ' + error.message); return false; }
      }
      await fin_(fd.getAll('relancer'));
      toast(`De retour · ${dureeTxt(min)} sur le plancher`);
    });
    d.classList.add('petit');
    const fin_ = async ids => {
      for (const id of ids) await sb.from('actions').update({ statut: 'En cours' }).eq('id', id);
      await ecrireReglage('plancher', { depuis: null, dernier: { depuis: p.depuis, fin: new Date().toISOString() } });
      rafraichir();
    };
    d.querySelector('#oublierPlancher').onclick = async () => { d.close(); await fin_([]); toast('Sortie oubliée (rien dans la feuille de temps)'); };
  }

  /* ================= 3. Feuille de temps ================= */
  const TYPES = {
    chrono: { lib: 'Tâche', ico: '▶', cls: 'ft-tache' },
    interruption: { lib: 'Interruption', ico: '🚨', cls: 'ft-inter' },
    fly: { lib: 'Fait sur le fly', ico: '⚡', cls: 'ft-fly' },
    evenement: { lib: 'Réunion / événement', ico: '📅', cls: 'ft-evt' },
    plancher: { lib: 'Plancher', ico: '🚶', cls: 'ft-plancher' },
  };
  async function elementsDuJour(jour) {
    const deb = depuisLocal(jour + 'T00:00'), fin = depuisLocal(plusJours(jour, 1) + 'T00:00');
    const tDeb = new Date(deb).getTime(), tFin = new Date(fin).getTime(), maint = Date.now();
    const { data: seances, error } = await sb.from('seances').select('*').lt('debut', fin).gt('fin', deb).order('debut');
    if (error) throw error;
    const el = [];
    const ajouter = (o) => {
      const d0 = Math.max(new Date(o.debut).getTime(), tDeb), d1 = Math.min(new Date(o.fin).getTime(), tFin);
      if (d1 <= d0) return;
      el.push({ ...o, d0, d1, min: Math.round((d1 - d0) / 6e4) });
    };
    (seances || []).forEach(s => ajouter({ type: s.type, seance: s, a: s.action_id ? parId(S.actions, s.action_id) : null, debut: s.debut, fin: s.fin, note: s.note }));
    // Séances en cours (chrono qui tourne, plancher en cours).
    S.actions.filter(a => a.statut === 'En cours' && a.chrono_debut).forEach(a => ajouter({ type: 'chrono', a, debut: a.chrono_debut, fin: new Date(maint).toISOString(), enCours: true }));
    const p = plancher(); if (p) ajouter({ type: 'plancher', debut: p.depuis, fin: new Date(maint).toISOString(), note: p.note, enCours: true });
    // Interruptions et fly : terminés à realisee_le, durée = duree_reelle_min.
    S.actions.filter(a => (a.interruption || a.sur_le_fly) && a.statut === 'Terminé' && a.realisee_le && a.duree_reelle_min).forEach(a => {
      const f = new Date(a.realisee_le).getTime();
      ajouter({ type: a.interruption ? 'interruption' : 'fly', a, debut: new Date(f - a.duree_reelle_min * 6e4).toISOString(), fin: a.realisee_le });
    });
    // Réunions et événements avec heure (les journées entières sont listées à part).
    S.actions.filter(a => a.type === 'Événement' && a.statut !== 'Annulé' && !a.journee_entiere && a.planifie_debut).forEach(a => {
      const f = a.planifie_fin || new Date(new Date(a.planifie_debut).getTime() + 30 * 6e4).toISOString();
      ajouter({ type: 'evenement', a, debut: a.planifie_debut, fin: f, aVenir: new Date(a.planifie_debut).getTime() > maint });
    });
    // Tâches terminées ce jour-là avec une durée réelle mais aucune séance (durée saisie à la main).
    const avecSeance = new Set((seances || []).map(s => s.action_id));
    const sansHeure = S.actions.filter(a => a.type !== 'Événement' && !a.interruption && !a.sur_le_fly && a.statut === 'Terminé' && a.realisee_le
      && cleJour(a.realisee_le) === jour && a.duree_reelle_min && !avecSeance.has(a.id));
    const journees = S.actions.filter(a => a.type === 'Événement' && a.statut !== 'Annulé' && a.journee_entiere && a.planifie_debut && cleJour(a.planifie_debut) <= jour && cleJour(a.planifie_fin || a.planifie_debut) >= jour);
    el.sort((x, y) => x.d0 - y.d0 || x.d1 - y.d1);
    return { el, sansHeure, journees, tDeb, tFin };
  }
  // Minutes couvertes par au moins un élément (les chevauchements ne comptent qu’une fois).
  function couvert(el) {
    const iv = el.filter(e => !e.aVenir).map(e => [e.d0, e.d1]).sort((a, b) => a[0] - b[0]);
    let tot = 0, cur = null;
    for (const [a, b] of iv) { if (!cur || a > cur[1]) { if (cur) tot += cur[1] - cur[0]; cur = [a, b]; } else cur[1] = Math.max(cur[1], b); }
    if (cur) tot += cur[1] - cur[0];
    return Math.round(tot / 6e4);
  }
  const titreEl = e => e.type === 'plancher' ? (e.note ? `Sur le plancher · ${e.note}` : 'Sur le plancher') : e.a?.titre || (e.type === 'chrono' ? 'Tâche supprimée' : '—');
  const projetEl = e => (e.a && parId(S.projets, e.a.projet_id)?.titre) || '';
  const hm = t => fmtHeure.format(new Date(t));

  async function vueFeuille(v) {
    if (!S.lot11) { v.innerHTML = `<div class="entete-vue"><div><h1>Feuille de temps</h1></div></div>${bloc('Migration à exécuter', null, vide('Exécute <code>supabase/migrations/20261124_bacs_plancher_feuille.sql</code> dans Supabase › SQL Editor, puis recharge ORBITE.'))}`; return; }
    const jour = S.filtres.jour || aujourdhui();
    v.innerHTML = `<div class="entete-vue"><div><h1>Feuille de temps</h1><p class="sous-titre">Chargement…</p></div></div>`;
    let r;
    try { r = await elementsDuJour(jour); } catch (e) { v.innerHTML += bloc('Erreur', null, vide(esc(e.message))); return; }
    if (S.vue !== 'feuille' || (S.filtres.jour || aujourdhui()) !== jour) return; // l’utilisateur est passé ailleurs entre-temps
    const { el, sansHeure, journees } = r;
    const passes = el.filter(e => !e.aVenir);
    const total = t => passes.filter(e => e.type === t).reduce((s, e) => s + e.min, 0);
    const minTaches = total('chrono') + sansHeure.reduce((s, a) => s + a.duree_reelle_min, 0);
    const tuile = (n, lib, cls = '') => `<div class="compteur calme ${cls}"><b>${esc(dureeTxt(n))}</b><span>${lib}</span></div>`;
    // Par tâche (séances de chrono + durées sans heure).
    const parTache = new Map();
    passes.filter(e => e.type === 'chrono').forEach(e => { const k = e.a?.id || e.seance?.action_id || '?'; const x = parTache.get(k) || { a: e.a, n: 0, min: 0, enCours: false }; x.n++; x.min += e.min; x.enCours ||= !!e.enCours; parTache.set(k, x); });
    sansHeure.forEach(a => parTache.set(a.id, { a, n: 0, min: a.duree_reelle_min, sansHeure: true }));
    const lignesTache = [...parTache.values()].sort((x, y) => y.min - x.min);
    // Ligne du temps : de la première à la dernière heure (au moins 7 h – 18 h).
    const h0 = Math.min(7, ...el.map(e => new Date(e.d0).getHours())), h1 = Math.max(18, ...el.map(e => new Date(e.d1 - 1).getHours() + 1));
    const tDebut = new Date(depuisLocal(`${jour}T${String(h0).padStart(2, '0')}:00`)).getTime(), etendue = (h1 - h0) * 36e5;
    const pos = t => Math.max(0, Math.min(100, (t - tDebut) / etendue * 100));
    const pistes = [['chrono', 'Tâches'], ['interruption', 'Interruptions / fly'], ['evenement', 'Réunions'], ['plancher', 'Plancher']];
    const piste = ([k, lib]) => {
      const items = el.filter(e => k === 'interruption' ? ['interruption', 'fly'].includes(e.type) : e.type === k);
      return `<div class="ft-piste"><div class="ft-lib">${lib}</div><div class="ft-rail">${items.map(e => `<span class="ft-bloc ${TYPES[e.type].cls}${e.enCours ? ' en-cours' : ''}${e.aVenir ? ' a-venir' : ''}" style="left:${pos(e.d0)}%;width:${Math.max(.4, pos(e.d1) - pos(e.d0))}%" title="${esc(`${hm(e.d0)}–${hm(e.d1)} · ${dureeTxt(e.min)} · ${titreEl(e)}`)}"></span>`).join('')}</div></div>`;
    };
    const graduations = [...Array(h1 - h0 + 1)].map((_, i) => `<span class="${(h0 + i) % 2 ? 'impaire' : ''}" style="left:${i / (h1 - h0) * 100}%">${h0 + i} h</span>`).join('');
    const lignesH = [...Array(h1 - h0 + 1)].map((_, i) => `<span class="ft-heure" style="left:${i / (h1 - h0) * 100}%"></span>`).join('');
    const maintenant = `<div class="ft-calque" aria-hidden="true">${lignesH}${jour === aujourdhui() ? `<span class="ft-maintenant" style="left:${pos(Date.now())}%" title="Maintenant"></span>` : ''}</div>`;
    const ligneChrono = (e, i) => `<li class="ligne ft-ligne${e.aVenir ? ' passe' : ''}" data-ft="${i}" role="button" tabindex="0" style="grid-template-columns:minmax(118px,auto) minmax(0,1fr) auto">
      <div class="heure">${esc(hm(e.d0))}–${e.enCours ? 'en cours' : esc(hm(e.d1))}</div>
      <div><div class="titre">${TYPES[e.type].ico} ${esc(titreEl(e))}</div><div class="meta"><span class="pastille ${TYPES[e.type].cls}">${TYPES[e.type].lib}</span>${projetEl(e) ? `<span>${esc(projetEl(e))}</span>` : ''}${e.a?.interruption_dept ? `<span>${esc([e.a.interruption_dept, e.a.interruption_type].filter(Boolean).join(' · '))}</span>` : ''}${e.aVenir ? '<span>à venir</span>' : ''}</div></div>
      <div class="droite">${esc(dureeTxt(e.min))}</div></li>`;
    const ajd = jour === aujourdhui();
    v.innerHTML = `<div class="entete-vue"><div><h1>Feuille de temps</h1><p class="sous-titre">${esc(jourLong(jour))}${passes.length ? ` · de ${esc(hm(passes[0].d0))} à ${esc(hm(Math.max(...passes.map(e => e.d1))))}` : ''}</p></div>
        <div class="boutons-entete"><button class="btn" id="ftCopier" title="Copier la chronologie (colle dans Excel)">Copier pour Excel</button><button class="btn" id="ftCsv">CSV</button></div></div>
      <div class="outils ft-nav"><button class="btn" data-jour="${plusJours(jour, -1)}" aria-label="Jour précédent">‹</button><input type="date" id="ftJour" value="${jour}" aria-label="Jour"><button class="btn" data-jour="${plusJours(jour, 1)}" aria-label="Jour suivant" ${ajd ? 'disabled' : ''}>›</button>${ajd ? '' : `<button class="btn discret" data-jour="${aujourdhui()}">Aujourd’hui</button>`}</div>
      <section class="compteurs ft-totaux" aria-label="Totaux">
        ${tuile(couvert(el), 'Temps couvert', 'ft-couvert')}${tuile(minTaches, 'Tâches')}${tuile(total('interruption'), 'Interruptions')}${tuile(total('fly'), 'Fly')}${tuile(total('evenement'), 'Réunions')}${tuile(total('plancher'), 'Plancher')}
      </section>
      <p class="aide ft-note">« Temps couvert » compte une seule fois les périodes qui se chevauchent (ex. une tâche qui continue sur le plancher). Les autres totaux additionnent chaque type.</p>
      ${bloc('Ligne du temps', null, `<div class="ft-temps"><div class="ft-grad">${graduations}</div>${pistes.map(piste).join('')}${maintenant}</div>`, '', 'ft-bloc-temps')}
      <div class="grille">
        <div class="colonne">${bloc('Chronologie', el.length, el.length ? `<ul class="lignes">${el.map(ligneChrono).join('')}</ul>` : vide('Rien de consigné ce jour-là. Les séances ▶ ⏸ apparaissent ici dès la migration faite.'))}</div>
        <div class="colonne">${bloc('Par tâche', lignesTache.length, lignesTache.length ? `<ul class="lignes">${lignesTache.map(x => `<li class="ligne" data-ft-tache="${x.a?.id || ''}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto">
            <div><div class="titre">${esc(x.a?.titre || 'Tâche supprimée')}</div><div class="meta">${x.a && parId(S.projets, x.a.projet_id) ? `<span>${esc(parId(S.projets, x.a.projet_id).titre)}</span>` : ''}<span>${x.sansHeure ? 'durée saisie, sans heure' : `${x.n} séance${x.n > 1 ? 's' : ''}`}</span>${x.enCours ? '<span class="pastille" data-st="En cours">en cours</span>' : ''}${x.a?.duree_min ? `<span>prévu ${esc(dureeTxt(x.a.duree_min))}</span>` : ''}</div></div>
            <div class="droite">${esc(dureeTxt(x.min))}</div></li>`).join('')}</ul>` : vide('Aucune tâche chronométrée.'))}
          ${journees.length ? bloc('Toute la journée', journees.length, `<ul class="lignes">${journees.map(a => `<li class="ligne" style="grid-template-columns:minmax(0,1fr)"><div class="titre">📅 ${esc(a.titre)}</div></li>`).join('')}</ul>`) : ''}</div>
      </div>`;
    v.querySelectorAll('[data-jour]').forEach(b => b.onclick = () => { S.filtres.jour = b.dataset.jour; rendre(); });
    v.querySelector('#ftJour').onchange = e => { if (e.target.value) { S.filtres.jour = e.target.value > aujourdhui() ? aujourdhui() : e.target.value; rendre(); } };
    v.querySelectorAll('[data-ft]').forEach(li => { const go = () => ouvrirElement(el[+li.dataset.ft]); li.onclick = go; li.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    v.querySelectorAll('[data-ft-tache]').forEach(li => li.onclick = () => { const a = parId(S.actions, li.dataset.ftTache); if (a) ouvrirAction(a); });
    const lignes = () => [['Date', 'Début', 'Fin', 'Minutes', 'Type', 'Titre', 'Projet', 'Détail'],
      ...el.filter(e => !e.aVenir).map(e => [jour, hm(e.d0), e.enCours ? '' : hm(e.d1), e.min, TYPES[e.type].lib, titreEl(e), projetEl(e), e.a?.interruption ? [e.a.interruption_dept, e.a.interruption_type, e.a.demandeur].filter(Boolean).join(' · ') : '']),
      ...sansHeure.map(a => [jour, '', '', a.duree_reelle_min, 'Tâche (sans heure)', a.titre, parId(S.projets, a.projet_id)?.titre || '', ''])];
    v.querySelector('#ftCopier').onclick = async () => {
      const tsv = lignes().map(l => l.map(x => String(x ?? '').replace(/[\t\n]/g, ' ')).join('\t')).join('\n');
      try { await navigator.clipboard.writeText(tsv); toast('Copié : colle dans Excel (Ctrl+V)'); } catch { toast('Copie refusée par le navigateur'); }
    };
    v.querySelector('#ftCsv').onclick = () => {
      const csv = '﻿' + lignes().map(l => l.map(x => `"${String(x ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `feuille-de-temps-${jour}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
  }
  // Toucher un élément : une séance terminée se corrige (heures) ou se supprime; le reste ouvre sa fiche.
  function ouvrirElement(e) {
    if (!e) return;
    if (!e.seance) { if (e.a) ouvrirAction(e.a); else if (e.type === 'plancher') retour(); return; }
    const s = e.seance, a = e.a;
    const d = dialogue(`<form>
      <div class="tete-d"><h2>${TYPES[s.type].ico} Corriger la séance</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">
        <p class="champ large" style="margin:0"><b>${esc(titreEl(e))}</b>${a ? ` · durée réelle de la tâche : ${esc(dureeTxt(a.duree_reelle_min || 0))}` : ''}</p>
        <label class="champ"><span>Début</span><input type="datetime-local" name="debut" value="${esc(versLocal(s.debut))}" required></label>
        <label class="champ"><span>Fin</span><input type="datetime-local" name="fin" value="${esc(versLocal(s.fin))}" required></label>
        ${s.type === 'plancher' ? `<label class="champ large"><span>Note</span><input name="note" value="${esc(s.note || '')}" autocomplete="off"></label>` : ''}
        ${a ? '<p class="aide champ large" style="margin:0">La durée réelle de la tâche est ajustée de la différence.</p>' : ''}
      </div>
      <div class="pied"><button type="button" class="btn danger gauche" data-suppr>Supprimer la séance</button><button type="button" class="btn" data-fermer>Annuler</button>${a ? '<button type="button" class="btn" data-fiche>Fiche de la tâche</button>' : ''}<button type="submit" class="btn primaire">Enregistrer</button></div>
    </form>`, async fd => {
      const debut = depuisLocal(fd.get('debut')), fin = depuisLocal(fd.get('fin'));
      if (!debut || !fin || new Date(fin) < new Date(debut)) { toast('La fin doit suivre le début'); return false; }
      const avant = s.minutes ?? minutesEntre(s.debut, s.fin), apres = minutesEntre(debut, fin);
      const { error } = await sb.from('seances').update({ debut, fin, ...(s.type === 'plancher' ? { note: (fd.get('note') || '').trim() || null } : {}) }).eq('id', s.id);
      if (error) { toast('Échec : ' + error.message); return false; }
      if (a && apres !== avant) await sb.from('actions').update({ duree_reelle_min: Math.max(0, (a.duree_reelle_min || 0) + apres - avant) }).eq('id', a.id);
      toast(`Séance corrigée${a && apres !== avant ? ` · durée réelle ${apres > avant ? '+' : '−'}${Math.abs(apres - avant)} min` : ''}`); rafraichir();
    });
    d.classList.add('petit');
    d.querySelector('[data-fiche]')?.addEventListener('click', () => { d.close(); ouvrirAction(a); });
    const sup = d.querySelector('[data-suppr]');
    sup.onclick = async () => {
      if (sup.dataset.ok !== '1') { sup.dataset.ok = '1'; sup.textContent = a ? `Confirmer (−${s.minutes ?? 0} min sur la tâche)` : 'Confirmer la suppression'; return; }
      const { error } = await sb.from('seances').delete().eq('id', s.id);
      if (error) return toast('Échec : ' + error.message);
      if (a && s.minutes) await sb.from('actions').update({ duree_reelle_min: Math.max(0, (a.duree_reelle_min || 0) - s.minutes) }).eq('id', a.id);
      d.close(); toast('Séance supprimée'); rafraichir();
    };
  }

  // Séances écrites par l’interface (correction d’un chrono pendant une interruption) et retirées par ⏮.
  async function noterSeance(actionId, debut, fin) {
    if (!S.lot11 || new Date(fin) <= new Date(debut)) return;
    await sb.from('seances').insert({ type: 'chrono', action_id: actionId, debut, fin });
  }
  async function annulerSeances(actionId, depuis) {
    if (!S.lot11) return;
    await sb.from('seances').delete().eq('action_id', actionId).gte('cree_le', new Date(new Date(depuis).getTime() - 5e3).toISOString());
  }

  return { charger, vues: { bacs: vueBacs, feuille: vueFeuille }, brancherAvert, bacsDe, boutonPlancher, bandeauPlancher, brancherPlancher, partir, retour, plancher,
    noterSeance, annulerSeances, seancesActives: () => S.lot11 };
}
