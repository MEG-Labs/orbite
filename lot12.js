// ORBITE · Lot 12 : mode présentation (tableau de bord plein écran).
// Bouton ⛶ dans l’en-tête ou touche D; Échap, D ou ✕ pour sortir. Vrai plein écran du navigateur quand il est permis.
// Un seul écran en tuiles lisibles de loin : tâche en cours en grand (chrono qui défile), ma journée (prochain événement,
// plan du jour, charge 8 h–17 h, plancher), engagements et alertes, chiffres du jour (feuille de temps, interruptions, victoires).
// On peut agir sans sortir : ▶ ⏸ ⏮, cocher, toucher une ligne pour sa fiche, ⚡ (F), interruption (I), plancher (P), capture (N).
export function installerLot12(c) {
  const { S, esc, parId, aujourdhui, plusJours, cleJour, jourDate, fmtHeure, liste, ouvert, enRetard, brancherLignes, triOuvert, visible } = c;
  let racine = null, minuterie = null, resume = null, resumeLe = 0;
  const dureeTxt = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
  const hm = d => fmtHeure.format(new Date(d));
  const fmtDateLongue = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Toronto', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  /* ---------- Prochain événement (compte à rebours sous l’heure) ---------- */
  function evtsDuJour() {
    const auj = aujourdhui();
    return S.actions.filter(a => a.type === 'Événement' && a.statut !== 'Annulé' && !a.journee_entiere && a.planifie_debut && cleJour(a.planifie_debut) === auj)
      .sort((a, b) => a.planifie_debut.localeCompare(b.planifie_debut));
  }
  const avant = ms => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : m >= 10 ? `${m} min` : `${m} min ${String(sec).padStart(2, '0')} s`; };
  function texteCompte() {
    const maint = Date.now(), evts = evtsDuJour();
    const fin = a => new Date(a.planifie_fin || a.planifie_debut).getTime();
    const actuel = evts.find(a => new Date(a.planifie_debut).getTime() <= maint && fin(a) > maint);
    const prochain = evts.find(a => new Date(a.planifie_debut).getTime() > maint);
    const parts = [];
    if (actuel) parts.push(`<span class="pr-compte-actuel">En cours : <b>${esc(actuel.titre)}</b> · finit dans ${esc(avant(fin(actuel) - maint))}</span>`);
    if (prochain) parts.push(`<span>Prochain : <b>${esc(prochain.titre)}</b> à ${esc(hm(prochain.planifie_debut))} · dans <em class="${new Date(prochain.planifie_debut) - maint < 10 * 6e4 ? 'bientot' : ''}">${esc(avant(new Date(prochain.planifie_debut) - maint))}</em></span>`);
    if (!parts.length) parts.push('<span>Plus rien à l’agenda aujourd’hui</span>');
    return parts.join('');
  }

  /* ---------- Minuterie (préréglages 5, 10, 15, 30 min, 1 h ou durée libre) ---------- */
  // État gardé sur l’appareil (localStorage « orbite-minuterie ») : elle survit à un rechargement et sonne même hors du mode présentation.
  const CLE_MIN = 'orbite-minuterie';
  const PRESETS = [[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']];
  let M = (() => { try { return JSON.parse(localStorage.getItem(CLE_MIN) || 'null'); } catch { return null; } })() || { etat: 'arret', total: 0, restant: 0, fin: 0 };
  const sauverMin = () => { try { localStorage.setItem(CLE_MIN, JSON.stringify(M)); } catch { } };
  const restantMs = () => M.etat === 'marche' ? Math.max(0, M.fin - Date.now()) : M.etat === 'pause' ? M.restant : M.etat === 'fini' ? 0 : M.total;
  const mmss = ms => { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(sec).padStart(2, '0'); };
  let audio = null;
  const preparerSon = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { audio = null; } };
  function sonner() {
    if (audio) {
      const t0 = audio.currentTime;
      [0, .45, .9, 1.8, 2.25, 2.7].forEach(d => { const o = audio.createOscillator(), g = audio.createGain(); o.type = 'sine'; o.frequency.value = 880;
        g.gain.setValueAtTime(0, t0 + d); g.gain.linearRampToValueAtTime(.35, t0 + d + .02); g.gain.linearRampToValueAtTime(0, t0 + d + .3);
        o.connect(g).connect(audio.destination); o.start(t0 + d); o.stop(t0 + d + .32); });
    }
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    c.toast?.(`⏰ Minuterie terminée (${mmss(M.total)})`);
    try { if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification('ORBITE · minuterie terminée', { body: `${mmss(M.total)} écoulées`, icon: 'icon-192.png' }); } catch { }
  }
  function lancer(min) {
    preparerSon();
    M = { etat: 'marche', total: min * 6e4, restant: 0, fin: Date.now() + min * 6e4 }; sauverMin(); majMinuterie();
  }
  function actionMinuterie(k) {
    if (k === 'pause' && M.etat === 'marche') M = { ...M, etat: 'pause', restant: Math.max(0, M.fin - Date.now()) };
    else if (k === 'reprendre' && M.etat === 'pause') { preparerSon(); M = { ...M, etat: 'marche', fin: Date.now() + M.restant }; }
    else if (k === 'plus1') { if (M.etat === 'marche') M = { ...M, fin: M.fin + 6e4, total: M.total + 6e4 }; else if (M.etat === 'pause') M = { ...M, restant: M.restant + 6e4, total: M.total + 6e4 }; else if (M.etat === 'fini') { lancer(1); return; } }
    else if (k === 'arret') M = { etat: 'arret', total: M.total, restant: 0, fin: 0 };
    sauverMin(); majMinuterie();
  }
  function htmlMinuterie() {
    const en = M.etat === 'marche' || M.etat === 'pause';
    const pct = M.total ? Math.round((1 - restantMs() / M.total) * 100) : 0;
    return `<div class="pr-minuterie etat-${M.etat}" data-minuterie>
      <div class="pr-min-affiche"><span class="pr-min-temps" data-min-temps>${en || M.etat === 'fini' ? mmss(restantMs()) : '--:--'}</span>
        <span class="pr-min-etat" data-min-etat>${M.etat === 'marche' ? 'Minuterie' : M.etat === 'pause' ? 'En pause' : M.etat === 'fini' ? '⏰ Terminé!' : 'Minuterie'}</span></div>
      <div class="pr-min-jauge"><i data-min-jauge style="width:${pct}%"></i></div>
      <div class="pr-min-boutons">
        ${PRESETS.map(([m, l]) => `<button type="button" class="btn" data-min-preset="${m}" title="Démarrer ${l}">${l}</button>`).join('')}
        <span class="pr-min-libre"><input type="number" min="1" max="600" step="1" inputmode="numeric" placeholder="min" aria-label="Durée libre en minutes" data-min-libre><button type="button" class="btn" data-min-go title="Démarrer la durée libre">▶</button></span>
      </div>
      ${en || M.etat === 'fini' ? `<div class="pr-min-boutons">
        ${M.etat === 'marche' ? '<button type="button" class="btn" data-min="pause">⏸ Pause</button>' : M.etat === 'pause' ? '<button type="button" class="btn primaire" data-min="reprendre">▶ Reprendre</button>' : ''}
        <button type="button" class="btn" data-min="plus1">+1 min</button><button type="button" class="btn" data-min="arret">${M.etat === 'fini' ? 'OK' : '✕ Arrêter'}</button></div>` : ''}
    </div>`;
  }
  function brancherMinuterie(r) {
    r.querySelectorAll('[data-min-preset]').forEach(b => b.onclick = () => lancer(+b.dataset.minPreset));
    const libre = r.querySelector('[data-min-libre]'), go = () => { const v = Math.round(+libre.value); if (v >= 1 && v <= 600) lancer(v); else c.toast?.('Durée entre 1 et 600 minutes'); };
    r.querySelector('[data-min-go]')?.addEventListener('click', go);
    libre?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } e.stopPropagation(); });
    r.querySelectorAll('[data-min]').forEach(b => b.onclick = () => actionMinuterie(b.dataset.min));
  }
  function majMinuterie() {
    const el = racine?.querySelector('[data-minuterie]'); if (!el) return;
    const libre = el.querySelector('[data-min-libre]')?.value;
    el.outerHTML = htmlMinuterie();
    const n = racine.querySelector('[data-minuterie]'); brancherMinuterie(n);
    if (libre) n.querySelector('[data-min-libre]').value = libre;
  }
  // Vérifiée chaque seconde, mode présentation ouvert ou non.
  setInterval(() => {
    if (M.etat === 'marche' && Date.now() >= M.fin) { M = { ...M, etat: 'fini', restant: 0 }; sauverMin(); sonner(); majMinuterie(); }
    if (!racine) return;
    const t = racine.querySelector('[data-min-temps]'); if (t && (M.etat === 'marche' || M.etat === 'pause')) t.textContent = mmss(restantMs());
    const j = racine.querySelector('[data-min-jauge]'); if (j && M.total) j.style.width = Math.round((1 - restantMs() / M.total) * 100) + '%';
  }, 250);
  const tuile = (titre, corps, cls = '', droite = '') => `<section class="pr-tuile ${cls}"><header><h2>${titre}</h2>${droite}</header><div class="pr-corps">${corps}</div></section>`;
  const vide = m => `<div class="vide">${m}</div>`;
  const ouvert_ = () => !!racine;

  // Chrono en secondes (h:mm:ss) pour la tâche vedette.
  const secondes = a => ((a.duree_reelle_min || 0) * 60) + (a.statut === 'En cours' && a.chrono_debut ? Math.max(0, Math.floor((Date.now() - new Date(a.chrono_debut)) / 1000)) : 0);
  const hms = s => `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function vedette(enCours, enPause) {
    const a = enCours.slice().sort((x, y) => (y.chrono_debut || '').localeCompare(x.chrono_debut || ''))[0] || null;
    if (!a) {
      return tuile('Tâche en cours', `<div class="pr-rien"><p>Rien en cours.</p><p class="aide">${enPause.length ? '▶ sur une tâche en pause, ci-dessous, pour la reprendre.' : '▶ sur une tâche du plan ou du backlog pour la commencer.'}</p></div>
        ${enPause.length ? `<h3 class="pr-sous">En pause</h3>${liste(enPause, '')}` : ''}`, 'pr-vedette');
    }
    const p = parId(S.projets, a.projet_id), s = secondes(a), prevu = a.duree_min ? a.duree_min * 60 : 0;
    const pct = prevu ? Math.min(100, Math.round(s / prevu * 100)) : 0;
    const autres = enCours.filter(x => x.id !== a.id);
    return tuile('Tâche en cours', `
      <div class="pr-titre-tache">${esc(a.titre)}</div>
      <div class="pr-sous-tache">${p ? esc(p.titre) : 'Hors projet'}${a.echeance ? ` · échéance ${esc(jourDate(a.echeance))}` : ''}</div>
      <div class="pr-chrono${a.chrono_debut ? ' tourne' : ''}${prevu && s > prevu ? ' depasse' : ''}" data-pr-chrono="${a.id}">${hms(s)}</div>
      ${prevu ? `<div class="pr-jauge" title="Réel contre prévu"><i style="width:${pct}%"></i></div><div class="pr-prevu">${esc(dureeTxt(Math.floor(s / 60)))} sur ${esc(dureeTxt(a.duree_min))} prévues</div>` : '<div class="pr-prevu">Aucune durée prévue</div>'}
      ${a.prochain_geste ? `<div class="pr-geste">▸ ${esc(a.prochain_geste)}</div>` : ''}
      <ul class="lignes pr-ligne-vedette">${liste([a], '').replace(/^<ul class="lignes">|<\/ul>$/g, '')}</ul>
      ${autres.length ? `<h3 class="pr-sous">Aussi en cours</h3>${liste(autres, '')}` : ''}
      ${enPause.length ? `<h3 class="pr-sous">En pause</h3>${liste(enPause, '')}` : ''}`, 'pr-vedette');
  }

  function journee() {
    const auj = aujourdhui(), maint = Date.now();
    const evts = S.actions.filter(a => a.type === 'Événement' && a.statut !== 'Annulé' && !a.journee_entiere && a.planifie_debut && cleJour(a.planifie_debut) === auj)
      .sort((a, b) => a.planifie_debut.localeCompare(b.planifie_debut));
    const fin = a => new Date(a.planifie_fin || a.planifie_debut).getTime();
    const actuel = evts.find(a => new Date(a.planifie_debut).getTime() <= maint && fin(a) > maint);
    const prochain = evts.find(a => new Date(a.planifie_debut).getTime() > maint);
    const avenir = evts.filter(a => fin(a) > maint && a !== actuel);
    const dans = t => { const m = Math.round((new Date(t) - maint) / 6e4); return m < 60 ? `dans ${m} min` : `dans ${dureeTxt(m)}`; };
    const plan = S.actions.filter(a => a.plan_du_jour === auj && a.type !== 'Événement');
    const faits = plan.filter(a => a.statut === 'Terminé').length;
    const pl = c.plancher?.();
    return tuile('Ma journée', `
      ${pl ? `<div class="pr-plancher">🚶 Sur le plancher depuis ${esc(hm(pl.depuis))} <button class="btn" data-plancher>De retour</button></div>` : ''}
      ${actuel ? `<div class="pr-evt actuel"><span>Maintenant · jusqu’à ${esc(hm(actuel.planifie_fin || actuel.planifie_debut))}</span><b>${esc(actuel.titre)}</b></div>` : ''}
      ${prochain ? `<div class="pr-evt"><span>Prochain · ${esc(hm(prochain.planifie_debut))} · <em data-pr-compte="${esc(prochain.planifie_debut)}">${esc(dans(prochain.planifie_debut))}</em></span><b>${esc(prochain.titre)}</b>${prochain.lieu ? `<small>${esc(prochain.lieu)}</small>` : ''}</div>`
        : !actuel ? '<div class="pr-evt libre"><span>Agenda</span><b>Plus rien à l’agenda aujourd’hui</b></div>' : ''}
      ${avenir.length > 1 ? `<div class="pr-suite">${avenir.filter(a => a !== prochain).slice(0, 4).map(a => `<span>${esc(hm(a.planifie_debut))} ${esc(a.titre)}</span>`).join('')}</div>` : ''}
      ${c.blocCharge ? c.blocCharge() : ''}
      <h3 class="pr-sous">Aujourd’hui, je fais ${plan.length ? `<span class="nb">${faits}/${plan.length}</span>` : ''}</h3>
      ${plan.length ? liste(plan, '') : vide('Aucune action choisie pour aujourd’hui.')}`, 'pr-journee');
  }

  function alertes() {
    const auj = aujourdhui(), demain = plusJours(auj, 1);
    const vis = S.actions.filter(a => (!visible || visible(a)) && a.type !== 'Événement');
    const promesses = vis.filter(a => ouvert(a) && a.promis_a_id && a.echeance && a.echeance <= demain).sort((a, b) => a.echeance.localeCompare(b.echeance));
    const retards = vis.filter(a => enRetard(a) && !promesses.includes(a)).sort(triOuvert);
    const relances = vis.filter(a => ouvert(a) && a.relance && a.relance <= auj);
    const bloques = vis.filter(a => ['Bloqué', 'En attente'].includes(a.statut));
    const aTrier = vis.filter(a => a.statut === 'À traiter');
    const chiffre = (n, lib, cls) => `<div class="pr-chiffre ${n ? cls : 'calme'}"><b>${n}</b><span>${lib}</span></div>`;
    const top = [...promesses, ...retards].slice(0, 6);
    return tuile('Engagements et alertes', `
      <div class="pr-chiffres">${chiffre(promesses.length, 'Promesses dues d’ici demain', 'alerte')}${chiffre(retards.length, 'En retard', 'alerte')}${chiffre(relances.length, 'Relances', 'attention')}${chiffre(bloques.length, 'Bloquées / en attente', 'attention')}${chiffre(aTrier.length, 'À trier', 'attention')}</div>
      ${top.length ? liste(top, '') : vide('Rien d’urgent. Bien joué.')}`, 'pr-alertes');
  }

  function chiffres() {
    const auj = aujourdhui();
    const inter = S.actions.filter(a => a.interruption && a.realisee_le && cleJour(a.realisee_le) === auj);
    const victoires = S.actions.filter(a => a.type !== 'Événement' && a.statut === 'Terminé' && a.realisee_le && cleJour(a.realisee_le) === auj);
    const r = resume;
    const ch = (v, lib, cls = '') => `<div class="pr-chiffre ${cls}"><b>${v}</b><span>${lib}</span></div>`;
    return tuile('Chiffres du jour', `
      <div class="pr-chiffres">
        ${ch(victoires.length, `Victoire${victoires.length > 1 ? 's' : ''}`, victoires.length ? 'bien' : 'calme')}
        ${ch(r ? esc(dureeTxt(r.taches)) : '—', 'Sur mes tâches')}
        ${ch(inter.length, `Interruption${inter.length > 1 ? 's' : ''}${r ? ` · ${esc(dureeTxt(r.interruptions))}` : ''}`, inter.length ? 'attention' : 'calme')}
        ${ch(r ? esc(dureeTxt(r.reunions)) : '—', 'Réunions')}
        ${ch(r ? esc(dureeTxt(r.couvert)) : '—', 'Temps couvert')}
        ${c.chiffreCafe?.() || ''}
      </div>
      ${r?.parTache.length ? `<ul class="pr-barres">${(() => { const max = Math.max(...r.parTache.map(x => x.min), 1); return r.parTache.slice(0, 6).map(x => `<li><span class="pr-barre-lib">${esc(x.a?.titre || 'Tâche supprimée')}${x.enCours ? ' ●' : ''}</span><span class="pr-barre"><i style="width:${Math.max(2, x.min / max * 100)}%"></i></span><b>${esc(dureeTxt(x.min))}</b></li>`).join(''); })()}</ul>`
        : vide(S.lot11 ? 'Aucune séance de chrono aujourd’hui.' : 'La feuille de temps demande la migration du lot 11.')}
      ${victoires.length ? `<div class="pr-victoires">${victoires.slice(-6).reverse().map(a => `<span>✓ ${esc(a.titre)}</span>`).join('')}</div>` : ''}`, 'pr-chiffres-jour');
  }

  function dessiner() {
    if (!racine) return;
    const taches = S.actions.filter(a => a.type !== 'Événement' && (!visible || visible(a) || ['En cours', 'En pause'].includes(a.statut)));
    const enCours = taches.filter(a => a.statut === 'En cours');
    const enPause = taches.filter(a => a.statut === 'En pause').sort(triOuvert);
    const defil = racine.querySelector('.pr-grille')?.scrollTop || 0;
    racine.innerHTML = `
      <div class="pr-barre-haut">
        <div class="pr-horloge">
          <div class="pr-heure-grande" data-pr-heure>${esc(hm(new Date()))}</div>
          <div class="pr-date-jour" data-pr-date>${esc(fmtDateLongue.format(new Date()))}</div>
          <div class="pr-compte" data-pr-compte-haut>${texteCompte()}</div>
        </div>
        <div class="pr-droite">
        <div class="pr-actions">
          ${S.lot11 ? `<button class="btn" data-plancher title="Plancher (P)">🚶 ${c.plancher?.() ? 'De retour' : 'Plancher'}</button>` : ''}
          <button class="btn" data-pr="fly" title="Fait sur le fly (F)">⚡ Fly</button>
          <button class="btn" data-pr="inter" title="Interruption (I)">🚨 Interruption</button>
          <button class="btn" data-pr="capture" title="Capture rapide (N)">＋ Capture</button>
          <button class="btn primaire" data-pr="sortir" title="Quitter le mode présentation (Échap ou D)">✕ Quitter</button>
        </div>
        ${htmlMinuterie()}
        </div>
      </div>
      <div class="pr-grille">
        ${vedette(enCours, enPause)}
        ${journee()}
        ${alertes()}
        ${chiffres()}
      </div>`;
    racine.querySelector('.pr-grille').scrollTop = defil;
    brancherLignes(racine);
    brancherMinuterie(racine);
    c.brancherPlancher?.(racine);
    c.brancherCafe?.(racine);
    racine.querySelector('[data-pr="fly"]').onclick = () => c.ouvrirSurLeFly();
    racine.querySelector('[data-pr="inter"]').onclick = () => c.ouvrirSurLeFly({ interruption: true });
    racine.querySelector('[data-pr="capture"]').onclick = () => c.ouvrirCapture();
    racine.querySelector('[data-pr="sortir"]').onclick = () => fermer();
  }
  async function majResume(force = false) {
    if (!c.resumeJour || (!force && Date.now() - resumeLe < 60e3)) return;
    resumeLe = Date.now();
    try { resume = await c.resumeJour(aujourdhui()); } catch { resume = null; }
    if (racine) { const t = racine.querySelector('.pr-chiffres-jour'); if (t) { t.outerHTML = chiffres(); brancherLignes(racine); c.brancherCafe?.(racine); } }
  }
  // Chaque seconde : heure, chrono vedette, compte à rebours. Chaque minute : tout le tableau (et le résumé du jour).
  function tic() {
    if (!racine) return;
    const n = new Date();
    racine.querySelectorAll('[data-pr-heure]').forEach(el => { el.textContent = hm(n); });
    const ch = racine.querySelector('[data-pr-compte-haut]'); if (ch) ch.innerHTML = texteCompte();
    const dj = racine.querySelector('[data-pr-date]'); if (dj) dj.textContent = fmtDateLongue.format(n);
    racine.querySelectorAll('[data-pr-chrono]').forEach(el => { const a = parId(S.actions, el.dataset.prChrono); if (a) el.textContent = hms(secondes(a)); });
    racine.querySelectorAll('[data-pr-compte]').forEach(el => { const m = Math.round((new Date(el.dataset.prCompte) - n) / 6e4); el.textContent = m <= 0 ? 'maintenant' : m < 60 ? `dans ${m} min` : `dans ${dureeTxt(m)}`; });
    if (n.getSeconds() === 0 && !(racine.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) { dessiner(); majResume(); }
  }

  function ouvrir() {
    if (racine) return;
    racine = document.createElement('div');
    racine.className = 'presentation'; racine.setAttribute('role', 'region'); racine.setAttribute('aria-label', 'Mode présentation');
    document.body.appendChild(racine); document.body.classList.add('en-presentation');
    dessiner(); majResume(true);
    minuterie = setInterval(tic, 1000);
    // Vrai plein écran (cache aussi la barre du navigateur). Refusé sur certains appareils : le tableau reste affiché.
    if (document.fullscreenEnabled && !document.fullscreenElement) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
  }
  function fermer() {
    if (!racine) return;
    clearInterval(minuterie); racine.remove(); racine = null;
    document.body.classList.remove('en-presentation');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  // Échap du navigateur (sortie du plein écran) : on quitte aussi le mode présentation.
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && racine) fermer(); });
  document.addEventListener('keydown', e => {
    if (!S.session || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || document.activeElement.isContentEditable) return;
    if (e.key.toLowerCase() === 'd') { e.preventDefault(); racine ? fermer() : ouvrir(); }
    else if (e.key === 'Escape' && racine) { e.preventDefault(); fermer(); }
  });
  const bouton = () => `<button type="button" class="btn-presentation" data-presentation title="Mode présentation (D)" aria-label="Mode présentation"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2"/></svg></button>`;
  const brancherBouton = r => r.querySelectorAll('[data-presentation]').forEach(b => b.onclick = () => ouvrir());

  return { ouvrir, fermer, maj: () => { if (racine) { dessiner(); majResume(true); } }, ouvert: ouvert_, bouton, brancherBouton };
}
