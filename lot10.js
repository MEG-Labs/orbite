// ORBITE · Lot 10 : menu d’interruption personnalisable et temps consigné ailleurs retiré des chronos.
// 1. Menu d’interruption : départements, types de demande, durées rapides et demandeurs fréquents,
//    modifiables dans Réglages (réglage `menu_interruption`, suit le compte). Renommer un choix renomme
//    aussi les interruptions déjà consignées (les stats de la revue restent regroupées).
// 2. Temps ailleurs : une interruption ou un « ⚡ Fait sur le fly » consigné pendant qu’un chrono tourne
//    retire son temps (la partie qui chevauche le chrono) de toutes les tâches en marche.
//    La tâche choisie dans « tu étais rendu où? » passe en plus « En pause ».
export function installerLot10(c) {
  const { sb, S, esc, toast, parId, dialogue, rendre } = c;
  const noterSeance = (...x) => c.noterSeance ? c.noterSeance(...x) : null; // feuille de temps (lot 11)

  /* ================= 1. Menu d’interruption ================= */
  const DEFAUT = {
    depts: ['Réception', 'Expédition', 'Conteneurs', 'Inventaire', 'Maintenance', 'Transport', 'Direction / bureau', 'Autre'],
    types: ['SAP / EWM', 'Équipement / RF', 'Données / rapport', 'Procédure / question', 'Problème opérationnel', 'Autre'],
    durees: [5, 15, 30, 60],
    demandeurs: [],
  };
  const LISTES = [
    { k: 'depts', titre: 'Départements', aide: 'Obligatoire dans une interruption : au moins un choix.', champ: 'interruption_dept', min: 1 },
    { k: 'types', titre: 'Types de demande', aide: 'Facultatif dans une interruption.', champ: 'interruption_type', min: 0 },
    { k: 'demandeurs', titre: 'Demandeurs fréquents', aide: 'Boutons qui remplissent « Demandé par ». La saisie libre et l’autocomplétion restent.', champ: 'demandeur', min: 0 },
    { k: 'durees', titre: 'Durées rapides (minutes)', aide: 'Boutons de « Temps passé ». « Autre » reste toujours offert.', nombre: true, min: 1 },
  ];
  function menu() {
    const v = S.reglages.find(r => r.cle === 'menu_interruption')?.valeur || {};
    const m = {};
    for (const l of LISTES) m[l.k] = Array.isArray(v[l.k]) && (v[l.k].length || l.min === 0) ? v[l.k] : DEFAUT[l.k];
    return m;
  }
  const libDuree = d => d < 60 ? `${d} min` : d % 60 ? `${Math.floor(d / 60)} h ${String(d % 60).padStart(2, '0')}` : `${d / 60} h`;

  function blocReglages() {
    const m = menu();
    const ligneListe = l => `<div class="menu-int-apercu"><b>${esc(l.titre)}</b><span>${m[l.k].length ? m[l.k].map(x => esc(l.nombre ? libDuree(x) : x)).join(' · ') : '<i>aucun</i>'}</span></div>`;
    return `<section class="bloc"><header><h2>🚨 Menu d’interruption</h2><button class="btn" id="modifMenuInt">Modifier</button></header>
      <div class="menu-int-resume">${LISTES.map(ligneListe).join('')}</div></section>`;
  }
  function complementReglages(v) {
    const cols = v.querySelectorAll('.grille > .colonne');
    const col = cols[1] || cols[0] || v;
    col.insertAdjacentHTML('beforeend', blocReglages());
    v.querySelector('#modifMenuInt').onclick = ouvrirEditeur;
  }

  function ouvrirEditeur() {
    const m = menu();
    const rangee = (l, val = '') => `<li class="menu-int-rangee" data-orig="${esc(val)}">
      <input ${l.nombre ? 'type="number" min="1" max="480" step="1" inputmode="numeric"' : 'autocomplete="off" maxlength="40"'} value="${esc(val)}" aria-label="${esc(l.titre)}">
      <button type="button" class="btn discret" data-monter title="Monter" aria-label="Monter">↑</button>
      <button type="button" class="btn discret" data-descendre title="Descendre" aria-label="Descendre">↓</button>
      <button type="button" class="btn discret" data-retirer title="Retirer" aria-label="Retirer">✕</button></li>`;
    const section = l => `<fieldset class="champ large menu-int-liste" data-liste="${l.k}"><legend>${esc(l.titre)}</legend>
      <p class="aide">${esc(l.aide)}</p>
      <ol>${m[l.k].map(x => rangee(l, x)).join('')}</ol>
      <button type="button" class="btn discret" data-ajouter>＋ Ajouter</button></fieldset>`;
    const d = dialogue(`<form>
      <div class="tete-d"><h2>🚨 Menu d’interruption</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">
        <p class="aide champ large" style="margin:0">Renommer un département, un type ou un demandeur renomme aussi les interruptions déjà consignées. Retirer un choix ne touche pas à l’historique : il n’est simplement plus proposé.</p>
        ${LISTES.map(section).join('')}
        <p class="champ large"><button type="button" class="btn discret" id="menuIntDefaut">Revenir aux choix d’origine</button></p>
      </div>
      <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div>
    </form>`, async () => enregistrer(d));
    d.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const li = b.closest('li'), fs = b.closest('[data-liste]');
      if (b.hasAttribute('data-retirer')) li.remove();
      else if (b.hasAttribute('data-monter') && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling);
      else if (b.hasAttribute('data-descendre') && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li);
      else if (b.hasAttribute('data-ajouter')) {
        const l = LISTES.find(x => x.k === fs.dataset.liste);
        fs.querySelector('ol').insertAdjacentHTML('beforeend', rangee(l));
        fs.querySelector('ol li:last-child input').focus();
      } else if (b.id === 'menuIntDefaut') {
        LISTES.forEach(l => { d.querySelector(`[data-liste="${l.k}"] ol`).innerHTML = DEFAUT[l.k].map(x => rangee(l, x)).join(''); });
        toast('Choix d’origine remis : « Enregistrer » pour confirmer');
      }
    });
    // Entrée dans une case : ajoute une ligne sous celle-ci au lieu d’enregistrer.
    d.addEventListener('keydown', e => {
      if (e.key !== 'Enter' || !e.target.closest('.menu-int-rangee')) return;
      e.preventDefault();
      const li = e.target.closest('li'), l = LISTES.find(x => x.k === li.closest('[data-liste]').dataset.liste);
      li.insertAdjacentHTML('afterend', rangee(l)); li.nextElementSibling.querySelector('input').focus();
    });
  }

  async function enregistrer(d) {
    const nouveau = {}, renommages = [];
    for (const l of LISTES) {
      const vus = new Set(), valeurs = [];
      d.querySelectorAll(`[data-liste="${l.k}"] li`).forEach(li => {
        const brut = li.querySelector('input').value.trim();
        const val = l.nombre ? Math.round(+brut) : brut.replace(/\s+/g, ' ');
        if (l.nombre ? !(val >= 1 && val <= 480) : !val) return;
        const cle = l.nombre ? val : val.toLocaleLowerCase('fr-CA');
        if (vus.has(cle)) return; vus.add(cle); valeurs.push(val);
        const orig = li.dataset.orig;
        if (!l.nombre && orig && orig !== val) renommages.push({ champ: l.champ, de: orig, a: val });
      });
      if (valeurs.length < l.min) { toast(`${l.titre} : au moins ${l.min} choix`); return false; }
      nouveau[l.k] = valeurs;
    }
    const { error } = await sb.from('reglages').upsert({ cle: 'menu_interruption', valeur: nouveau });
    if (error) { toast('Échec : ' + error.message); return false; }
    const r = S.reglages.find(x => x.cle === 'menu_interruption');
    if (r) r.valeur = nouveau; else S.reglages.push({ cle: 'menu_interruption', valeur: nouveau });
    // Historique : les interruptions consignées suivent le nouveau nom.
    let n = 0;
    for (const x of renommages) {
      const { data, error: e } = await sb.from('actions').update({ [x.champ]: x.a }).eq('interruption', true).eq(x.champ, x.de).select('id');
      if (e) { toast(`Menu enregistré, mais « ${x.de} » n’a pas été renommé dans l’historique : ${e.message}`); continue; }
      n += data?.length || 0;
      S.actions.forEach(a => { if (a.interruption && a[x.champ] === x.de) a[x.champ] = x.a; });
    }
    toast(`Menu d’interruption enregistré${n ? ` · ${n} interruption${n > 1 ? 's' : ''} renommée${n > 1 ? 's' : ''}` : ''}`);
    rendre();
  }

  /* ================= 2. Temps consigné ailleurs, retiré des chronos ================= */
  // intervalle = { debut, fin } (ISO) : la période de l’interruption ou de la tâche faite sur le fly.
  // pauser = id de la tâche à mettre « En pause » (celle choisie dans « tu étais rendu où? »), ou null.
  // Renvoie [{ a, retire }] pour les tâches corrigées.
  async function retirerTempsAilleurs(intervalle, pauser = null) {
    const maintenant = Date.now();
    const deb = intervalle ? new Date(intervalle.debut).getTime() : maintenant;
    const fin = intervalle ? Math.min(new Date(intervalle.fin).getTime(), maintenant) : maintenant;
    const enMarche = S.actions.filter(a => a.statut === 'En cours' && a.chrono_debut && a.type !== 'Événement');
    const faits = [];
    const iso = t => new Date(t).toISOString();
    for (const a of enMarche) {
      const debChrono = new Date(a.chrono_debut).getTime();
      const retire = Math.max(0, Math.round((fin - Math.max(deb, debChrono)) / 6e4));
      // Parties du chrono hors de l’interruption : avant (chrono → début de l’interruption) et après (fin → maintenant).
      const avantFin = Math.min(deb, maintenant), apresDeb = Math.max(fin, debChrono);
      const minAvant = avantFin > debChrono ? Math.round((avantFin - debChrono) / 6e4) : 0;
      let champs = null, seances = [];
      if (a.id === pauser) {
        // Pause avec le temps corrigé : on règle nous-mêmes durée et chrono (le déclencheur n’ajoute alors rien).
        const minApres = maintenant > apresDeb ? Math.round((maintenant - apresDeb) / 6e4) : 0;
        champs = { statut: 'En pause', chrono_debut: null, duree_reelle_min: (a.duree_reelle_min || 0) + minAvant + minApres };
        if (minAvant) seances.push([iso(debChrono), iso(avantFin)]);
        if (minApres) seances.push([iso(apresDeb), iso(maintenant)]);
      } else if (retire > 0) {
        // Chrono qui continue : la partie d’avant l’interruption devient une séance, le chrono repart à la fin de l’interruption.
        champs = { chrono_debut: iso(Math.min(apresDeb, maintenant)), duree_reelle_min: (a.duree_reelle_min || 0) + minAvant };
        if (minAvant) seances.push([iso(debChrono), iso(avantFin)]);
      }
      if (!champs) continue;
      const { error } = await sb.from('actions').update(champs).eq('id', a.id);
      if (error) { toast(`Chrono de « ${a.titre} » non corrigé : ${error.message}`); continue; }
      for (const [d0, d1] of seances) await noterSeance(a.id, d0, d1);
      if (retire > 0) faits.push({ a, retire });
    }
    // Tâche choisie qui n’avait pas de chrono en marche (ex. « En cours » sans chrono) : simple pause.
    const choisie = pauser && parId(S.actions, pauser);
    if (choisie && 'chrono_debut' in choisie && choisie.statut === 'En cours' && !choisie.chrono_debut) await sb.from('actions').update({ statut: 'En pause' }).eq('id', choisie.id);
    return faits;
  }
  const texteRetire = faits => !faits.length ? '' : faits.length === 1
    ? ` · −${faits[0].retire} min sur « ${faits[0].a.titre} »`
    : ` · −${Math.max(...faits.map(f => f.retire))} min sur ${faits.length} tâches en cours`;

  return { menu, libDuree, complementReglages, retirerTempsAilleurs, texteRetire };
}
