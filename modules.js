// Modules ORBITE : véhicules, achats, abonnements, transports, bibliothèque, carnet, routines, revue, organigramme.
export function installerModules(c) {
  const { sb, S, $, esc, toast, parId, aujourdhui, plusJours, jourDate, cleJour, fmtHeure, versLocal, depuisLocal, dialogue, rafraichir, liste, ouvert, enRetard, manquants } = c;

  /* ---------- Outils ---------- */
  const argent = new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' });
  const fmtArgent = v => v == null || v === '' ? '' : argent.format(+v);
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const MOIS_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const pad = n => String(n).padStart(2, '0');
  const ymd = (y, m) => `${y}-${pad(m)}-01`;
  const moisDe = cle => +cle.slice(5, 7);
  const anDe = cle => +cle.slice(0, 4);
  const pastille = (txt, ton = '') => `<span class="pastille ${ton}">${esc(txt)}</span>`;
  const vide = (msg) => `<div class="vide">${msg}</div>`;
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const entete = (titre, sous, boutons = '') =>
    `<div class="entete-vue"><div><h1>${titre}</h1><p class="sous-titre">${sous}</p></div><div class="boutons">${boutons}</div></div>`;

  /* ---------- Formulaire générique ---------- */
  function champHTML(f, v) {
    const lbl = `<span>${esc(f.l)}</span>`;
    const req = f.req ? 'required' : '';
    const cls = `champ ${f.large ? 'large' : ''}`;
    switch (f.t) {
      case 'textarea': return `<label class="${cls} large"><span>${esc(f.l)}</span><textarea name="${f.k}" rows="${f.rows || 4}" ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>${esc(v)}</textarea></label>`;
      case 'number': return `<label class="${cls}">${lbl}<input type="number" step="${f.step || 'any'}" name="${f.k}" value="${v ?? ''}" ${req}></label>`;
      case 'date': return `<label class="${cls}">${lbl}<input type="date" name="${f.k}" value="${v || ''}" ${req}></label>`;
      case 'datetime': return `<label class="${cls}">${lbl}<input type="datetime-local" name="${f.k}" value="${versLocal(v)}" ${req}></label>`;
      case 'bool': return `<label class="champ case ${f.large ? 'large' : ''}"><input type="checkbox" name="${f.k}" ${v ? 'checked' : ''}><span>${esc(f.l)}</span></label>`;
      case 'select': {
        const o = typeof f.o === 'function' ? f.o() : f.o;
        return `<label class="${cls}">${lbl}<select name="${f.k}" ${req}>${f.req ? '' : '<option value="">—</option>'}${o.map(x => { const [val, lib] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(val)}" ${String(val) === String(v ?? '') ? 'selected' : ''}>${esc(lib)}</option>`; }).join('')}</select></label>`;
      }
      case 'ref': {
        const o = f.o();
        return `<label class="${cls}">${lbl}<select name="${f.k}" ${req}><option value="">—</option>${o.map(x => `<option value="${x.id}" ${x.id === v ? 'selected' : ''}>${esc(x[f.lib || 'nom'])}</option>`).join('')}</select></label>`;
      }
      case 'multi': {
        const o = typeof f.o === 'function' ? f.o() : f.o; const sel = v || [];
        return `<div class="champ large"><span>${esc(f.l)}</span><div class="types-rapides">${o.map(x => { const [val, lib] = Array.isArray(x) ? x : [x, x]; return `<label><input type="checkbox" name="${f.k}" value="${esc(val)}" ${sel.map(String).includes(String(val)) ? 'checked' : ''}><span>${esc(lib)}</span></label>`; }).join('')}</div></div>`;
      }
      case 'tags': return `<label class="${cls}">${lbl}<input name="${f.k}" value="${esc((v || []).join(', '))}" placeholder="Séparés par des virgules"></label>`;
      default: return `<label class="${cls}">${lbl}<input name="${f.k}" value="${esc(v)}" ${req} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} ${f.titre ? 'class="titre-saisie"' : ''}></label>`;
    }
  }
  function lire(f, fd) {
    const brut = fd.get(f.k);
    switch (f.t) {
      case 'number': return brut === '' || brut == null ? null : +brut;
      case 'bool': return brut === 'on';
      case 'datetime': return depuisLocal(brut);
      case 'multi': return fd.getAll(f.k).map(x => f.num ? +x : x);
      case 'tags': return (brut || '').split(',').map(s => s.trim()).filter(Boolean);
      case 'select': return brut === '' ? null : (f.num ? +brut : brut);
      default: return (brut ?? '').trim() === '' ? null : brut.trim();
    }
  }
  function fiche({ titre, table, champs, ligne = {}, apres, avant, pied = '' }) {
    const nouveau = !ligne.id;
    const d = dialogue(`<form>
      <div class="tete-d"><h2>${esc(titre)}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">${champs.map(f => f.section ? `<p class="section-fiche">${esc(f.section)}</p>` : champHTML(f, ligne[f.k])).join('')}${pied}</div>
      <div class="pied">${nouveau ? '' : '<button type="button" class="btn danger gauche" data-suppr>Supprimer</button>'}
        <button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div>
    </form>`, async (fd, dlg) => {
      const val = {};
      champs.filter(f => f.k && !f.virtuel).forEach(f => { val[f.k] = lire(f, fd); });
      if (avant) { const r = avant(val, fd, dlg); if (r === false) return false; }
      const r = nouveau ? await sb.from(table).insert(val).select('id').single() : await sb.from(table).update(val).eq('id', ligne.id).select('id').single();
      if (r.error) { toast('Échec : ' + r.error.message); return false; }
      if (apres) await apres(r.data.id, val, fd);
      toast(nouveau ? 'Ajouté' : 'Enregistré'); rafraichir();
    });
    const s = d.querySelector('[data-suppr]');
    if (s) s.onclick = async () => {
      if (s.dataset.ok !== '1') { s.dataset.ok = '1'; s.textContent = 'Confirmer la suppression'; return; }
      const { error } = await sb.from(table).delete().eq('id', ligne.id);
      if (error) return toast('Échec : ' + error.message);
      d.close(); toast('Supprimé'); rafraichir();
    };
    return d;
  }
  const brancher = (v, sel, fn) => v.querySelectorAll(sel).forEach(el => {
    el.onclick = e => { if (e.target.closest('button, select, input, a') && el !== e.target.closest('button')) return; fn(el, e); };
    if (el.getAttribute('role') === 'button') el.onkeydown = e => { if (e.key === 'Enter') fn(el, e); };
  });

  /* ================= Véhicules ================= */
  function liensIntervention(id) { return S.intEnt.filter(x => x.intervention_id === id).map(x => x.entretien_id); }
  function derniereRealisation(e) {
    const ids = S.intEnt.filter(x => x.entretien_id === e.id).map(x => x.intervention_id);
    return S.interventions.filter(i => ids.includes(i.id) && i.statut === 'Terminée' && i.date).map(i => i.date).sort().pop() || null;
  }
  function statutEntretien(e) {
    if (!e.actif) return { cle: 'inactif', lib: 'Inactif', ordre: 9 };
    if (!e.mois_prevus?.length) return { cle: 'config', lib: 'À configurer', ordre: 4 };
    const auj = aujourdhui(), y = anDe(auj), m = moisDe(auj);
    const debuts = e.mois_prevus.map(mm => mm <= m ? ymd(y, mm) : ymd(y - 1, mm)).sort();
    const courant = debuts.pop();
    const prochains = e.mois_prevus.map(mm => mm > m ? ymd(y, mm) : ymd(y + 1, mm)).sort();
    const prochain = prochains[0];
    const der = derniereRealisation(e);
    const ecart = (y * 12 + m) - (anDe(courant) * 12 + moisDe(courant));
    const moisProchain = (y * 12 + m + 1);
    const estMoisProchain = anDe(prochain) * 12 + moisDe(prochain) === moisProchain;
    if (der && der >= courant) return { cle: 'ok', lib: 'À jour', ordre: 6, der, prochain };
    if (ecart === 0) return { cle: 'mois', lib: 'Ce mois-ci', ordre: 1, der, prochain: courant };
    if (ecart <= 2) return { cle: 'retard', lib: 'En retard', ordre: 0, der, prochain: courant };
    if (estMoisProchain) return { cle: 'avenir', lib: 'À venir', ordre: 2, der, prochain };
    return { cle: 'plan', lib: 'Planifié', ordre: 5, der, prochain };
  }
  const tonStatut = { retard: 'st-Bloqué', mois: 'st-À traiter', avenir: 'st-En attente', ok: 'st-Terminé', config: '', plan: '', inactif: '' };
  function pneusMontes(v) {
    const inter = S.interventions.filter(i => i.vehicule_id === v.id && i.statut === 'Terminée' && i.date).sort((a, b) => b.date.localeCompare(a.date));
    for (const i of inter) {
      const p = liensIntervention(i.id).map(id => parId(S.entretiens, id)?.pneus_poses).find(Boolean);
      if (p) return { pneus: p, date: i.date };
    }
    return null;
  }
  function ligneEntretien(e, montrerVehicule = true) {
    const st = statutEntretien(e); const v = parId(S.vehicules, e.vehicule_id);
    const quandTxt = st.cle === 'ok' ? `Prochain : ${MOIS_LONG[moisDe(st.prochain) - 1].toLowerCase()} ${anDe(st.prochain)}` : st.prochain ? `Période : ${MOIS_LONG[moisDe(st.prochain) - 1].toLowerCase()} ${anDe(st.prochain)}` : 'Indique le ou les mois prévus';
    return `<li class="ligne" data-entretien="${e.id}" role="button" tabindex="0" style="grid-template-columns:auto minmax(0,1fr) auto">
      ${pastille(st.lib, tonStatut[st.cle])}
      <div><div class="titre">${esc(e.entretien)}</div><div class="meta">${montrerVehicule && v ? `<span>${esc(v.nom)}</span>` : ''}<span>${esc(quandTxt)}</span>${st.der ? `<span>Fait le ${esc(jourDate(st.der))}</span>` : ''}${e.rendez_vous ? `<span>RDV ${esc(jourDate(cleJour(e.rendez_vous)))}</span>` : ''}</div></div>
      <div>${['retard', 'mois', 'avenir'].includes(st.cle) ? `<button class="btn" data-fait="${e.id}">Fait</button>` : ''}</div></li>`;
  }

  function vueVehicules(v) {
    setTimeout(() => { const h = c.encartPneus?.(); if (h) v.insertAdjacentHTML('afterbegin', h); });
    const actifs = S.entretiens.filter(e => e.actif);
    const attention = actifs.map(e => [e, statutEntretien(e)]).filter(([, s]) => ['retard', 'mois', 'avenir', 'config'].includes(s.cle)).sort((a, b) => a[1].ordre - b[1].ordre);
    const an = anDe(aujourdhui());
    v.innerHTML = entete('Entretien des véhicules', 'Programme saisonnier, interventions et dépenses par véhicule.',
      `<button class="btn" id="ajVeh">Ajouter un véhicule</button><button class="btn primaire" id="ajInt">Enregistrer une intervention</button>`) + `
      <div class="grille">
        <div class="colonne">
          ${bloc('Ce qui demande mon attention', attention.length, attention.length ? `<ul class="lignes">${attention.map(([e]) => ligneEntretien(e)).join('')}</ul>` : vide('Tout est à jour pour la période en cours.'))}
          ${bloc('Interventions et factures', S.interventions.length, S.interventions.length ? `<table class="tableau"><thead><tr><th>Date</th><th>Intervention</th><th class="opt">Véhicule</th><th class="opt">Km</th><th>Coût</th></tr></thead><tbody>
            ${S.interventions.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(i => `<tr data-inter="${i.id}"><td>${i.date ? esc(jourDate(i.date)) : '—'}</td><td>${esc(i.titre)}${i.statut !== 'Terminée' ? ' ' + pastille(i.statut) : ''}</td><td class="opt">${esc(parId(S.vehicules, i.vehicule_id)?.nom)}</td><td class="opt">${i.kilometrage ? i.kilometrage.toLocaleString('fr-CA') : ''}</td><td>${fmtArgent(i.cout_cad)}</td></tr>`).join('')}
          </tbody></table>` : vide('Aucune intervention enregistrée.'))}
        </div>
        <div class="colonne">
          ${S.vehicules.map(vh => {
            const p = pneusMontes(vh); const ents = S.entretiens.filter(e => e.vehicule_id === vh.id);
            const dep = S.interventions.filter(i => i.vehicule_id === vh.id && i.statut === 'Terminée' && i.date?.startsWith(String(an))).reduce((s, i) => s + (+i.cout_cad || 0), 0);
            return `<section class="bloc"><header><h2>${esc(vh.nom)}</h2><button class="btn discret" data-veh="${vh.id}">Modifier</button></header>
              <div class="fiche-faits">
                <div><b>${vh.km_actuel ? vh.km_actuel.toLocaleString('fr-CA') + ' km' : '—'}</b><span>${vh.km_releve_le ? 'Relevé le ' + esc(jourDate(vh.km_releve_le)) : 'Kilométrage'}</span></div>
                <div><b>${p ? esc(p.pneus) : '—'}</b><span>Pneus montés</span></div>
                <div><b>${fmtArgent(dep)}</b><span>Dépenses ${an}</span></div>
              </div>
              <ul class="lignes">${ents.map(e => ligneEntretien(e, false)).join('')}</ul>
              <div class="pied-bloc"><button class="btn discret" data-ajent="${vh.id}">Ajouter un entretien</button></div></section>`;
          }).join('') || bloc('Véhicules', 0, vide('Ajoute ton premier véhicule.'))}
        </div>
      </div>`;
    $('#ajVeh').onclick = () => ficheVehicule({ etat: 'En service' });
    $('#ajInt').onclick = () => ficheIntervention({ statut: 'Terminée', date: aujourdhui(), vehicule_id: S.vehicules[0]?.id });
    v.querySelectorAll('[data-veh]').forEach(b => b.onclick = () => ficheVehicule(parId(S.vehicules, b.dataset.veh)));
    v.querySelectorAll('[data-ajent]').forEach(b => b.onclick = () => ficheEntretien({ vehicule_id: b.dataset.ajent, actif: true, mois_prevus: [] }));
    v.querySelectorAll('[data-fait]').forEach(b => b.onclick = e => { e.stopPropagation(); const en = parId(S.entretiens, b.dataset.fait); ficheIntervention({ statut: 'Terminée', date: aujourdhui(), vehicule_id: en.vehicule_id, titre: en.entretien }, [en.id]); });
    brancher(v, '[data-entretien]', el => ficheEntretien(parId(S.entretiens, el.dataset.entretien)));
    brancher(v, '[data-inter]', el => { const i = parId(S.interventions, el.dataset.inter); ficheIntervention(i, liensIntervention(i.id)); });
  }
  function ficheVehicule(vh) {
    fiche({ titre: vh.id ? vh.nom : 'Nouveau véhicule', table: 'vehicules', ligne: vh, champs: [
      { k: 'nom', l: 'Nom', req: true, large: true, titre: true, ph: 'VW Atlas 2019' },
      { k: 'marque', l: 'Marque' }, { k: 'modele', l: 'Modèle' }, { k: 'annee', l: 'Année', t: 'number', step: 1 },
      { k: 'etat', l: 'État', t: 'select', o: ['En service', 'Vendu', 'Hors service'], req: true },
      { k: 'km_actuel', l: 'Kilométrage actuel', t: 'number', step: 1 }, { k: 'km_releve_le', l: 'Relevé le', t: 'date' },
      { k: 'pneus_reference', l: 'Pneus de référence', t: 'select', o: ['Été', 'Hiver', '4 saisons'] },
      { k: 'dimensions_pneus', l: 'Dimensions des pneus' }, { k: 'immatriculation', l: 'Immatriculation' }, { k: 'niv', l: 'NIV' },
      { k: 'motorisation', l: 'Motorisation' }, { k: 'notes', l: 'Notes', t: 'textarea' },
    ] });
  }
  function ficheEntretien(e) {
    fiche({ titre: e.id ? e.entretien : 'Nouvel entretien', table: 'entretiens', ligne: e, champs: [
      { k: 'entretien', l: 'Entretien', req: true, large: true, titre: true, ph: 'Pose des pneus d’hiver' },
      { k: 'vehicule_id', l: 'Véhicule', t: 'ref', o: () => S.vehicules, req: true },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Huile moteur', 'Pneus', 'Filtres', 'Freins', 'Batterie', 'Liquides', 'Inspection', 'Autre'] },
      { k: 'mois_prevus', l: 'Mois prévus', t: 'multi', num: true, o: MOIS_LONG.map((m, i) => [i + 1, m]) },
      { k: 'pneus_poses', l: 'Pose de pneus', t: 'select', o: ['Été', 'Hiver'] },
      { k: 'rendez_vous', l: 'Rendez-vous', t: 'datetime' },
      { k: 'intervalle_km', l: 'Intervalle (km)', t: 'number', step: 500 }, { k: 'intervalle_mois', l: 'Intervalle (mois)', t: 'number', step: 1 },
      { k: 'actif', l: 'Actif', t: 'bool' }, { k: 'notes', l: 'Notes', t: 'textarea' },
    ] });
  }
  function ficheIntervention(i, entretiensLies = []) {
    const nouveau = !i.id;
    const cases = vid => S.entretiens.filter(e => e.vehicule_id === vid).map(e => `<label><input type="checkbox" name="entretiens" value="${e.id}" ${entretiensLies.includes(e.id) ? 'checked' : ''}><span>${esc(e.entretien)}</span></label>`).join('') || '<span class="aide">Aucun entretien programmé pour ce véhicule.</span>';
    const d = fiche({ titre: nouveau ? 'Nouvelle intervention' : 'Intervention', table: 'interventions', ligne: i,
      champs: [
        { k: 'titre', l: 'Intervention', req: true, large: true, titre: true, ph: 'Changement d’huile' },
        { k: 'vehicule_id', l: 'Véhicule', t: 'ref', o: () => S.vehicules, req: true },
        { k: 'statut', l: 'Statut', t: 'select', o: ['Planifiée', 'Terminée', 'Annulée'], req: true },
        { k: 'date', l: 'Date', t: 'date' }, { k: 'kilometrage', l: 'Kilométrage', t: 'number', step: 1 },
        { k: 'cout_cad', l: 'Coût (CAD)', t: 'number', step: 0.01 }, { k: 'garage', l: 'Garage ou réalisé par' },
        { k: 'travaux', l: 'Travaux et pièces', t: 'textarea' },
      ],
      pied: `<div class="champ large"><span>Entretiens réalisés</span><div class="types-rapides" id="casesEnt">${cases(i.vehicule_id)}</div></div>`,
      apres: async (id, val, fd) => {
        await sb.from('interventions_entretiens').delete().eq('intervention_id', id);
        const ids = fd.getAll('entretiens');
        if (ids.length) await sb.from('interventions_entretiens').insert(ids.map(e => ({ intervention_id: id, entretien_id: e })));
        const vh = parId(S.vehicules, val.vehicule_id);
        if (val.kilometrage && vh && (!vh.km_actuel || val.kilometrage > vh.km_actuel)) await sb.from('vehicules').update({ km_actuel: val.kilometrage, km_releve_le: val.date || aujourdhui() }).eq('id', vh.id);
      } });
    const sel = d.querySelector('[name=vehicule_id]');
    sel.onchange = () => { d.querySelector('#casesEnt').innerHTML = cases(sel.value); };
  }

  /* ================= Achats ================= */
  const STATUTS_ACHAT = ['À compléter', 'À acheter', 'Commandé', 'Partiellement reçu', 'Reçu', 'Annulé'];
  function ligneAchat(a) {
    const p = parId(S.projets, a.projet_id);
    const total = a.quantite && a.prix_unitaire ? a.quantite * a.prix_unitaire : null;
    const fait = a.statut === 'Reçu';
    return `<li class="ligne ${['Reçu', 'Annulé'].includes(a.statut) ? 'ferme' : ''}" data-achat="${a.id}" role="button" tabindex="0">
      <button class="coche ${fait ? 'fait' : ''}" data-recu="${a.id}" aria-label="${fait ? 'Remettre à acheter' : 'Marquer reçu'} : ${esc(a.item)}"></button>
      <div><div class="titre">${esc(a.item)}</div><div class="meta">
        ${a.quantite ? `<span>${esc(a.quantite)} ${esc(a.unite || '')}</span>` : '<span class="retard">Quantité à préciser</span>'}
        ${a.departement ? `<span>${esc(a.departement)}</span>` : ''}${p ? `<span>${esc(p.titre)}</span>` : ''}
        ${a.priorite ? `<span class="retard">${esc(a.priorite)}</span>` : ''}${a.besoin_pour ? `<span>Pour le ${esc(jourDate(a.besoin_pour))}</span>` : ''}
        ${!['À acheter', 'Reçu'].includes(a.statut) ? pastille(a.statut) : ''}${a.budget_ligne_id ? '<span>budget</span>' : ''}${a.facture_chemin ? '<span>facture</span>' : ''}</div></div>
      <div class="droite">${fmtArgent(total)}</div></li>`;
  }
  function vueAchats(v) {
    const onglet = S.filtres.achats || 'acheter';
    const groupes = { acheter: ['À compléter', 'À acheter'], recevoir: ['Commandé', 'Partiellement reçu'], historique: ['Reçu', 'Annulé'] };
    const items = S.achats.filter(a => groupes[onglet].includes(a.statut)).sort((a, b) => b.cree_le.localeCompare(a.cree_le));
    let corps;
    if (onglet === 'acheter') {
      const parMag = {};
      items.forEach(a => (parMag[a.magasin || 'Magasin à préciser'] ||= []).push(a));
      corps = Object.keys(parMag).sort().map(m => bloc(esc(m), parMag[m].length, `<ul class="lignes">${parMag[m].map(ligneAchat).join('')}</ul>`)).join('') || bloc('Liste', 0, vide('Rien à acheter. Note un article dès que tu y penses.'));
    } else corps = bloc(onglet === 'recevoir' ? 'À recevoir' : 'Historique', items.length, items.length ? `<ul class="lignes">${items.map(ligneAchat).join('')}</ul>` : vide(onglet === 'recevoir' ? 'Aucune commande en attente.' : 'Rien dans l’historique.'));
    v.innerHTML = entete('Achats', 'Tout ce qu’il faut acheter, par magasin. Le projet est facultatif.', '<button class="btn primaire" id="ajAchat">Ajouter un article</button>') + `
      <div class="outils"><div class="onglets">
        ${[['acheter', 'À acheter'], ['recevoir', 'À recevoir'], ['historique', 'Historique']].map(([k, l]) => `<button aria-pressed="${onglet === k}" data-onglet="${k}">${l} <span class="nb">${S.achats.filter(a => groupes[k].includes(a.statut)).length}</span></button>`).join('')}
      </div></div><div class="pile">${corps}</div>`;
    v.querySelectorAll('[data-onglet]').forEach(b => b.onclick = () => { S.filtres.achats = b.dataset.onglet; c.rendre(); });
    $('#ajAchat').onclick = () => ficheAchat({ statut: 'À acheter', unite: 'unité', quantite: 1 });
    v.querySelectorAll('[data-recu]').forEach(b => b.onclick = async e => {
      e.stopPropagation(); const a = parId(S.achats, b.dataset.recu);
      const { error } = await sb.from('achats').update({ statut: a.statut === 'Reçu' ? 'À acheter' : 'Reçu' }).eq('id', a.id);
      if (error) return toast('Échec : ' + error.message);
      toast(a.statut === 'Reçu' ? 'Remis à acheter' : 'Reçu'); rafraichir();
    });
    brancher(v, '[data-achat]', el => ficheAchat(parId(S.achats, el.dataset.achat)));
  }
  function ficheAchat(a) {
    const magasins = [...new Set(['Canac', ...S.achats.map(x => x.magasin).filter(Boolean)])];
    const postes = () => S.budget.slice().sort((x, y) => (x.lot || '').localeCompare(y.lot || '') || x.poste.localeCompare(y.poste))
      .map(l => [l.id, `${parId(S.projets, l.projet_id)?.titre || ''} · ${(l.lot || '').replace(/^\d+ · /, '')} · ${l.poste}`]);
    const pied = `<div class="champ large facture"><span>Photo ou PDF de la facture</span>
      ${a.facture_chemin ? `<div class="rangee"><button type="button" class="btn" data-voir-facture>Voir la facture</button><span class="aide">Une nouvelle photo remplace l’ancienne.</span></div>` : ''}
      <input type="file" name="facture" accept="image/*,application/pdf"></div>`;
    const d = fiche({ titre: a.id ? a.item : 'Nouvel article', table: 'achats', ligne: a, pied, apres: async (id, val, fd) => {
      const f = fd.get('facture');
      if (!f || !f.size) return;
      if (f.size > 10 * 1024 * 1024) return toast('Facture trop lourde (10 Mo max.)');
      const ext = (f.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const chemin = `${id}/${Date.now()}.${ext}`;
      const up = await sb.storage.from('factures').upload(chemin, f, { contentType: f.type || undefined, upsert: false });
      if (up.error) return toast('Facture non envoyée : ' + up.error.message);
      if (a.facture_chemin) await sb.storage.from('factures').remove([a.facture_chemin]);
      await sb.from('achats').update({ facture_chemin: chemin }).eq('id', id);
    }, champs: [
      { k: 'item', l: 'Article', req: true, large: true, titre: true },
      { k: 'statut', l: 'Statut', t: 'select', o: STATUTS_ACHAT, req: true },
      { k: 'magasin', l: 'Magasin', ph: magasins.join(', ') },
      { k: 'quantite', l: 'Quantité', t: 'number' }, { k: 'unite', l: 'Unité', ph: 'unité, paquet, boîte…' },
      { k: 'departement', l: 'Département ou rayon' }, { k: 'priorite', l: 'Priorité', t: 'select', o: ['1 — Urgent', '2 — Bientôt', '3 — Quand possible'] },
      { k: 'prix_unitaire', l: 'Prix unitaire (CAD)', t: 'number', step: 0.01 }, { k: 'montant_paye', l: 'Montant payé (CAD)', t: 'number', step: 0.01 },
      { k: 'besoin_pour', l: 'Besoin pour le', t: 'date' }, { k: 'projet_id', l: 'Projet', t: 'ref', o: () => S.projets, lib: 'titre' },
      { section: 'Commande en ligne' },
      { k: 'commande_le', l: 'Commandé le', t: 'date' }, { k: 'reception_prevue', l: 'Réception prévue', t: 'date' },
      { k: 'quantite_recue', l: 'Quantité reçue', t: 'number' }, { k: 'reference', l: 'Référence produit' },
      { k: 'lien', l: 'Lien produit', large: true },
      { section: 'Budget' },
      { k: 'budget_ligne_id', l: 'Poste de budget (passe à « Payé » quand l’article est reçu)', t: 'select', o: postes, large: true },
      { k: 'notes', l: 'Notes', t: 'textarea' },
    ] });
    const vf = d.querySelector('[data-voir-facture]');
    if (vf) vf.onclick = async () => {
      const { data, error } = await sb.storage.from('factures').createSignedUrl(a.facture_chemin, 300);
      if (error) return toast('Échec : ' + error.message);
      window.open(data.signedUrl, '_blank', 'noopener');
    };
  }

  /* ================= Abonnements ================= */
  const FACTEUR = { Hebdomadaire: 52 / 12, Mensuel: 1, Trimestriel: 1 / 3, Semestriel: 1 / 6, Annuel: 1 / 12 };
  function deciderAvant(a) {
    const ref = a.fin_essai || a.prochaine_facturation; if (!ref) return null;
    return plusJours(ref, -((a.preavis_jours || 0) + 7));
  }
  function vueAbonnements(v) {
    const auj = aujourdhui(), dans14 = plusJours(auj, 14);
    const actifs = S.abonnements.filter(a => ['Actif', 'Essai', 'À résilier'].includes(a.statut));
    const mensuel = actifs.filter(a => FACTEUR[a.frequence] && a.montant).reduce((s, a) => s + a.montant * FACTEUR[a.frequence], 0);
    const incomplets = actifs.filter(a => !a.frequence || !a.montant || !a.prochaine_facturation && !a.date_fin);
    const bientot = actifs.filter(a => [a.prochaine_facturation, a.fin_essai, deciderAvant(a)].some(d => d && d <= dans14)).sort((a, b) => (a.prochaine_facturation || '9').localeCompare(b.prochaine_facturation || '9'));
    const lignes = S.abonnements.slice().sort((a, b) => (a.statut === 'Résilié') - (b.statut === 'Résilié') || (a.prochaine_facturation || '9999').localeCompare(b.prochaine_facturation || '9999'));
    v.innerHTML = entete('Abonnements', 'Prix, fréquence, prochaine facturation et essais.', '<button class="btn primaire" id="ajAbo">Ajouter un abonnement</button>') + `
      <section class="compteurs trois" aria-label="Budget">
        <div class="compteur calme"><b>${fmtArgent(mensuel)}</b><span>Par mois (équivalent)</span></div>
        <div class="compteur calme"><b>${fmtArgent(mensuel * 12)}</b><span>Par année</span></div>
        <div class="compteur ${incomplets.length ? 'attention' : 'calme'}"><b>${incomplets.length}</b><span>Fiches à compléter</span></div>
      </section>
      ${bientot.length ? bloc('Dans les 14 prochains jours', bientot.length, `<ul class="lignes">${bientot.map(a => {
        const da = deciderAvant(a);
        return `<li class="ligne" data-abo="${a.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="titre">${esc(a.nom)}</div><div class="meta">
          ${a.prochaine_facturation ? `<span>Facturation ${esc(jourDate(a.prochaine_facturation))}</span>` : ''}${a.fin_essai ? `<span class="retard">Fin d’essai ${esc(jourDate(a.fin_essai))}</span>` : ''}
          ${da && a.decision && a.decision !== 'Garder' ? `<span class="retard">Décider avant le ${esc(jourDate(da))}</span>` : ''}${a.decision ? pastille(a.decision, a.decision === 'Garder' ? 'st-Terminé' : 'st-À traiter') : ''}</div></div>
          <div class="droite">${fmtArgent(a.montant)}</div></li>`; }).join('')}</ul>`, '', 'signal') : ''}
      ${bloc('Tous mes abonnements', S.abonnements.length, `<table class="tableau"><thead><tr><th>Service</th><th>Montant</th><th class="opt">Fréquence</th><th>Prochaine</th><th class="opt">Statut</th><th class="opt">Décision</th></tr></thead><tbody>
        ${lignes.map(a => `<tr data-abo="${a.id}"><td>${esc(a.nom)}${a.tarif_verifie ? '' : ' <span class="aide">tarif à vérifier</span>'}</td><td>${fmtArgent(a.montant) || '<span class="aide">À renseigner</span>'}</td>
          <td class="opt">${esc(a.frequence) || '<span class="aide">À renseigner</span>'}</td><td>${a.prochaine_facturation ? esc(jourDate(a.prochaine_facturation)) : a.date_fin ? 'Fin ' + esc(jourDate(a.date_fin)) : '—'}</td>
          <td class="opt">${esc(a.statut)}</td><td class="opt">${esc(a.decision || '')}</td></tr>`).join('')}</tbody></table>`)}`;
    $('#ajAbo').onclick = () => ficheAbonnement({ statut: 'Actif', devise: 'CAD', frequence: 'Mensuel', renouvellement: 'Automatique' });
    brancher(v, '[data-abo]', el => ficheAbonnement(parId(S.abonnements, el.dataset.abo)));
  }
  function ficheAbonnement(a) {
    fiche({ titre: a.id ? a.nom : 'Nouvel abonnement', table: 'abonnements', ligne: a, champs: [
      { k: 'nom', l: 'Service', req: true, large: true, titre: true },
      { k: 'statut', l: 'Statut', t: 'select', o: ['Actif', 'Essai', 'À résilier', 'Résilié', 'En pause'], req: true },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Divertissement', 'Téléphone et Internet', 'Logiciels', 'Maison', 'Transport', 'Santé', 'Finances', 'Autre'] },
      { k: 'montant', l: 'Montant par cycle', t: 'number', step: 0.01 }, { k: 'devise', l: 'Devise', t: 'select', o: ['CAD', 'USD', 'EUR'] },
      { k: 'frequence', l: 'Fréquence', t: 'select', o: Object.keys(FACTEUR) }, { k: 'renouvellement', l: 'Renouvellement', t: 'select', o: ['Automatique', 'Manuel'] },
      { k: 'prochaine_facturation', l: 'Prochaine facturation', t: 'date' }, { k: 'date_fin', l: 'Date de fin (contrat)', t: 'date' },
      { k: 'debut_essai', l: 'Début d’essai', t: 'date' }, { k: 'fin_essai', l: 'Fin d’essai', t: 'date' },
      { k: 'preavis_jours', l: 'Préavis (jours)', t: 'number', step: 1 }, { k: 'decision', l: 'Décision', t: 'select', o: ['Garder', 'Réduire', 'Annuler', 'À évaluer'] },
      { k: 'tarif_verifie', l: 'Tarif vérifié', t: 'bool' }, { k: 'resilie_le', l: 'Résilié le', t: 'date' },
      { k: 'compte', l: 'Compte utilisé' }, { k: 'moyen_paiement', l: 'Moyen de paiement', ph: 'Ex. Visa perso (pas le numéro)' },
      { k: 'lien_gestion', l: 'Lien pour gérer ou annuler', large: true }, { k: 'notes', l: 'Notes', t: 'textarea' },
    ] });
  }

  /* ================= Transports familiaux ================= */
  const MODELE_SEMAINE = [
    { code: 'AM_DEPOT', h: '07:40', lib: 'Déposer les trois enfants', enfants: 'Trois enfants' },
    { code: 'MIDI_RETOUR', h: '11:10', lib: 'Récupérer les trois enfants', enfants: 'Trois enfants' },
    { code: 'MIDI_DEPOT', h: '12:20', lib: 'Déposer les trois enfants', enfants: 'Trois enfants' },
    { code: 'PM_RETOUR', h: '14:09', lib: 'Récupérer Édouard', enfants: 'Édouard' },
  ];
  const JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
  const STATUTS_TRAJET = ['À attribuer', 'À confirmer', 'Confirmé', 'Fait', 'Annulé'];
  // Les semaines commencent le dimanche.
  function dimancheDe(cle) { const d = new Date(cle + 'T12:00:00'); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); }
  const responsables = () => [...new Set(['Maman', 'Papa', 'Mamie', ...S.trajets.map(t => t.responsable).filter(Boolean)])];
  function ligneTrajet(t) {
    return `<li class="ligne trajet ${t.statut === 'Annulé' ? 'ferme' : ''}" data-trajet="${t.id}">
      <div class="heure">${t.date_heure ? esc(fmtHeure.format(new Date(t.date_heure))) : '—'}</div>
      <div><div class="titre">${esc(t.titre.split(' • ').pop())}</div><div class="meta">${t.enfants ? `<span>${esc(t.enfants)}</span>` : ''}${t.depart || t.destination ? `<span>${esc(t.depart || '?')} → ${esc(t.destination || '?')}</span>` : ''}${(() => { const e = c.conflitDe(t); return e ? `<span class="retard">${t.responsable ? 'Conflit' : 'Tu es pris'} : ${esc(e.titre)} ${esc(fmtHeure.format(new Date(e.planifie_debut)))}</span>` : ''; })()}${(() => {
        // Événement de l’agenda qui correspond à ce trajet : rappel neutre, et attribution en un geste si personne n’est inscrit.
        const e = c.agendaDe(t); if (!e) return '';
        return `<span class="a-agenda">À l’agenda : ${esc(e.titre)} ${esc(fmtHeure.format(new Date(e.planifie_debut)))}</span>${!t.responsable && !['Fait', 'Annulé'].includes(t.statut) ? `<button class="btn discret btn-moi" data-moi="${t.id}">C’est moi</button>` : ''}`;
      })()}</div></div>
      <div class="selecteurs">
        <select data-resp="${t.id}" aria-label="Responsable">${['', ...responsables()].map(r => `<option value="${esc(r)}" ${r === (t.responsable || '') ? 'selected' : ''}>${r || 'Qui?'}</option>`).join('')}</select>
        <select data-stt="${t.id}" aria-label="Statut" class="stt-${esc(t.statut)}">${STATUTS_TRAJET.map(s => `<option ${s === t.statut ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </div></li>`;
  }
  function vueTransports(v) {
    const base = S.filtres.semaine || dimancheDe(aujourdhui());
    const fin = plusJours(base, 7);
    const items = S.trajets.filter(t => t.date_heure && cleJour(t.date_heure) >= base && cleJour(t.date_heure) < fin).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
    const parJour = {}; items.forEach(t => (parJour[cleJour(t.date_heure)] ||= []).push(t));
    const aAttribuer = items.filter(t => t.statut !== 'Annulé' && (!t.responsable || t.statut === 'À attribuer')).length;
    const auj = aujourdhui();
    v.innerHTML = entete('Transports familiaux', `Semaine du ${esc(jourDate(base))}${aAttribuer ? ` · <span class="retard">${aAttribuer} trajet${aAttribuer > 1 ? 's' : ''} à attribuer</span>` : ''}`,
      `<button class="btn" id="genSem">Créer la semaine type</button><button class="btn primaire" id="ajTraj">Ajouter un trajet</button>`) + `
      <div class="outils"><div class="onglets">
        <button data-sem="-7">‹ Précédente</button><button data-sem="0" aria-pressed="${base === dimancheDe(auj)}">Cette semaine</button><button data-sem="7">Suivante ›</button>
      </div></div>
      ${Object.keys(parJour).length ? Object.keys(parJour).map(j => `<section class="jour ${j === auj ? 'aujourdhui' : ''}"><h3>${esc(c.jourLong(j))}${j === auj ? ' · aujourd’hui' : ''}</h3><ul class="lignes">${parJour[j].map(ligneTrajet).join('')}</ul></section>`).join('')
        : bloc('Semaine', 0, vide('Aucun trajet cette semaine. « Créer la semaine type » ajoute les 20 trajets du lundi au vendredi, sans responsable.'))}`;
    v.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => { const n = +b.dataset.sem; S.filtres.semaine = n === 0 ? dimancheDe(auj) : plusJours(base, n); c.rendre(); });
    $('#ajTraj').onclick = () => ficheTrajet({ statut: 'À attribuer' });
    $('#genSem').onclick = async () => {
      const existantes = new Set(S.trajets.map(t => t.cle_occurrence));
      const nouveaux = [];
      for (let i = 0; i < 5; i++) {
        const jour = plusJours(base, i + 1); // lundi à vendredi
        for (const m of MODELE_SEMAINE) {
          const cle = `${jour}|${m.code}`;
          if (existantes.has(cle)) continue;
          nouveaux.push({ cle_occurrence: cle, titre: `${JOURS[i]} • ${m.lib}`, date_heure: depuisLocal(`${jour}T${m.h}`), enfants: m.enfants, statut: 'À attribuer' });
        }
      }
      if (!nouveaux.length) return toast('La semaine type existe déjà');
      const { error } = await sb.from('trajets').insert(nouveaux);
      if (error) return toast('Échec : ' + error.message);
      toast(`${nouveaux.length} trajets créés`); rafraichir();
    };
    v.querySelectorAll('[data-resp]').forEach(s => s.onchange = async () => {
      const t = parId(S.trajets, s.dataset.resp);
      const maj = { responsable: s.value || null };
      if (s.value && t.statut === 'À attribuer') maj.statut = 'Confirmé';
      const { error } = await sb.from('trajets').update(maj).eq('id', t.id);
      if (error) return toast('Échec : ' + error.message);
      toast('Responsable : ' + (s.value || 'aucun')); rafraichir();
    });
    v.querySelectorAll('[data-moi]').forEach(b => b.onclick = async e => {
      e.stopPropagation();
      const { error } = await sb.from('trajets').update({ responsable: c.moiTransport(), statut: 'Confirmé' }).eq('id', b.dataset.moi);
      if (error) return toast('Échec : ' + error.message);
      toast('Trajet à ta charge'); rafraichir();
    });
    v.querySelectorAll('[data-stt]').forEach(s => s.onchange = async () => {
      const { error } = await sb.from('trajets').update({ statut: s.value }).eq('id', s.dataset.stt);
      if (error) return toast('Échec : ' + error.message);
      toast(s.value); rafraichir();
    });
    v.querySelectorAll('[data-trajet] .titre').forEach(el => { el.style.cursor = 'pointer'; el.onclick = () => ficheTrajet(parId(S.trajets, el.closest('[data-trajet]').dataset.trajet)); });
  }
  function ficheTrajet(t) {
    fiche({ titre: t.id ? 'Trajet' : 'Nouveau trajet', table: 'trajets', ligne: t, champs: [
      { k: 'titre', l: 'Trajet', req: true, large: true, titre: true, ph: 'LUNDI • Déposer les trois enfants' },
      { k: 'date_heure', l: 'Date et heure', t: 'datetime', req: true },
      { k: 'statut', l: 'Statut', t: 'select', o: STATUTS_TRAJET, req: true },
      { k: 'responsable', l: 'Responsable', t: 'select', o: responsables },
      { k: 'enfants', l: 'Enfant(s)' }, { k: 'depart', l: 'Départ' }, { k: 'destination', l: 'Destination' },
    ] });
  }
  function trajetsDuJour() {
    const auj = aujourdhui();
    return S.trajets.filter(t => t.date_heure && cleJour(t.date_heure) === auj && t.statut !== 'Annulé').sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  }

  /* ================= Bibliothèque ================= */
  const STATUTS_LIVRE = ['À lire', 'En lecture', 'En pause', 'Terminé', 'Abandonné'];
  const ENVIES = [[1, '1 — Mon prochain livre'], [2, '2 — Bientôt'], [3, '3 — Un jour']];
  const NOTES = [[5, '5 — Coup de cœur'], [4, '4 — Très bon'], [3, '3 — Correct'], [2, '2 — Bof'], [1, '1 — À éviter']];
  function carteLivre(l) {
    const pct = l.longueur && l.position ? Math.min(100, Math.round(100 * l.position / l.longueur)) : 0;
    return `<div class="projet" data-livre="${l.id}" role="button" tabindex="0">
      <div class="tete"><span class="nom">${esc(l.titre)}</span>${l.note ? `<span class="etoiles" aria-label="${l.note} sur 5">${'★'.repeat(l.note)}${'☆'.repeat(5 - l.note)}</span>` : ''}</div>
      <div class="prochaine">${[l.auteur, l.format, l.disponibilite].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
      ${l.statut === 'En lecture' ? `<div class="chiffres"><span>${l.position || 0} / ${l.longueur || '?'} ${esc((l.unite || 'pages').toLowerCase())}</span>${l.commence_le ? `<span>Depuis le ${esc(jourDate(l.commence_le))}</span>` : ''}</div>
        <div class="jauge" aria-hidden="true"><i style="width:${pct}%"></i></div>${l.repere ? `<div class="geste">▸ ${esc(l.repere)}</div>` : ''}
        <div class="pied-bloc" style="padding:8px 0 0"><button class="btn" data-avance="${l.id}">Mettre à jour ma page</button></div>` : ''}
      ${l.statut === 'Terminé' ? `<div class="chiffres">${l.termine_le ? `<span>Terminé le ${esc(jourDate(l.termine_le))}</span>` : ''}${l.conseille_par ? `<span>Conseillé par ${esc(l.conseille_par)}</span>` : ''}</div>${l.avis ? `<div class="geste">« ${esc(l.avis)} »</div>` : ''}` : ''}
      ${l.statut === 'À lire' && l.pourquoi ? `<div class="geste">${esc(l.pourquoi)}</div>` : ''}
    </div>`;
  }
  function vueBibliotheque(v) {
    const L = S.livres;
    const enLecture = L.filter(l => l.statut === 'En lecture');
    const prochain = L.filter(l => l.statut === 'À lire' && l.envie === 1);
    const aLire = L.filter(l => l.statut === 'À lire' && l.envie !== 1);
    const avis = L.filter(l => l.statut === 'Terminé' && (!l.avis || !l.note));
    const termines = L.filter(l => l.statut === 'Terminé').sort((a, b) => (b.termine_le || '').localeCompare(a.termine_le || ''));
    const an = String(anDe(aujourdhui()));
    const cartes = arr => `<div class="cartes-projets">${arr.map(carteLivre).join('')}</div>`;
    v.innerHTML = entete('Bibliothèque et lectures', `${termines.filter(l => l.termine_le?.startsWith(an)).length} livre(s) lu(s) en ${an}. Idéalement, un seul livre en lecture à la fois.`, '<button class="btn primaire" id="ajLivre">Ajouter un livre</button>') + `
      <div class="pile">
        <h2 class="titre-section">En ce moment <span class="nb">${enLecture.length}</span></h2>${enLecture.length ? cartes(enLecture) : bloc('', null, vide('Aucun livre en lecture.'))}
        ${avis.length ? `<h2 class="titre-section">Avis à rédiger <span class="nb">${avis.length}</span></h2>${cartes(avis)}` : ''}
        <h2 class="titre-section">Mon prochain livre</h2>${prochain.length ? cartes(prochain) : bloc('', null, vide('Choisis « Envie : 1 — Mon prochain livre » sur un titre à lire.'))}
        ${aLire.length ? `<h2 class="titre-section">À lire <span class="nb">${aLire.length}</span></h2>${cartes(aLire)}` : ''}
        <h2 class="titre-section">Terminés <span class="nb">${termines.length}</span></h2>${termines.length ? cartes(termines) : bloc('', null, vide('Aucun livre terminé.'))}
      </div>`;
    $('#ajLivre').onclick = () => ficheLivre({ statut: 'À lire', unite: 'Pages' });
    v.querySelectorAll('[data-avance]').forEach(b => b.onclick = e => { e.stopPropagation(); avancerLivre(parId(S.livres, b.dataset.avance)); });
    brancher(v, '[data-livre]', el => ficheLivre(parId(S.livres, el.dataset.livre)));
  }
  function avancerLivre(l) {
    c.dialogue(`<form><div class="tete-d"><h2>${esc(l.titre)}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps"><label class="champ"><span>Où j’en suis (${esc((l.unite || 'pages').toLowerCase())})</span><input type="number" name="position" value="${l.position ?? ''}" min="0" autofocus></label>
      <label class="champ"><span>Sur</span><input type="number" name="longueur" value="${l.longueur ?? ''}" min="0"></label>
      <label class="champ large"><span>Repère de reprise</span><input name="repere" value="${esc(l.repere)}" placeholder="Reprendre au chapitre 8"></label>
      <label class="champ case large"><input type="checkbox" name="fini"><span>Je l’ai terminé</span></label></div>
      <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div></form>`, async fd => {
      const maj = { position: fd.get('position') ? +fd.get('position') : null, longueur: fd.get('longueur') ? +fd.get('longueur') : null, repere: fd.get('repere') || null };
      if (fd.get('fini') === 'on') Object.assign(maj, { statut: 'Terminé', termine_le: aujourdhui(), position: maj.longueur || maj.position });
      const { error } = await sb.from('livres').update(maj).eq('id', l.id);
      if (error) { toast('Échec : ' + error.message); return false; }
      toast(maj.statut ? 'Bravo, livre terminé' : 'Progression enregistrée'); rafraichir();
    });
  }
  function ficheLivre(l) {
    fiche({ titre: l.id ? l.titre : 'Nouveau livre', table: 'livres', ligne: l, champs: [
      { k: 'titre', l: 'Titre', req: true, large: true, titre: true }, { k: 'auteur', l: 'Auteur' },
      { k: 'statut', l: 'Statut', t: 'select', o: STATUTS_LIVRE, req: true }, { k: 'envie', l: 'Envie', t: 'select', o: ENVIES, num: true },
      { k: 'format', l: 'Format', t: 'select', o: ['Papier', 'Numérique', 'Audio'] }, { k: 'disponibilite', l: 'Disponibilité', t: 'select', o: ['À trouver', 'Possédé', 'Emprunté', 'Bibliothèque', 'Abonnement'] },
      { k: 'unite', l: 'Unité', t: 'select', o: ['Pages', 'Pourcentage', 'Minutes', 'Chapitres'] }, { k: 'longueur', l: 'Longueur totale', t: 'number', step: 1 },
      { k: 'position', l: 'Position actuelle', t: 'number', step: 1 }, { k: 'repere', l: 'Repère de reprise' },
      { k: 'commence_le', l: 'Commencé le', t: 'date' }, { k: 'termine_le', l: 'Terminé le', t: 'date' },
      { k: 'genres', l: 'Genres', t: 'tags' }, { k: 'langue', l: 'Langue', t: 'select', o: ['Français', 'Anglais', 'Autre'] },
      { k: 'conseille_par', l: 'Conseillé par' }, { k: 'a_recommander', l: 'À recommander à' },
      { k: 'pourquoi', l: 'Pourquoi le lire', t: 'textarea', rows: 2 },
      { section: 'Mon avis' },
      { k: 'note', l: 'Note sur 5', t: 'select', o: NOTES, num: true }, { k: 'coup_de_coeur', l: 'Coup de cœur', t: 'bool' },
      { k: 'avis', l: 'Mon avis', t: 'textarea', rows: 3, ph: 'De quoi parle-t-il? Qu’est-ce qui m’a plu, moins plu? À qui le conseiller?' },
      { k: 'a_retenir', l: 'À retenir', t: 'textarea', rows: 3 }, { k: 'citations', l: 'Citations et passages', t: 'textarea', rows: 3 },
      { k: 'lien', l: 'Lien du livre', large: true },
    ] });
  }

  /* ================= Carnet ================= */
  const TYPES_NOTE = ['Note', 'Idée', 'Compte rendu', 'Décision', 'Référence', 'Bilan'];
  /* Cahiers : regroupent des notes (facultatif); un cahier ou une note peut être lié à un projet ou à une tâche. */
  const COULEURS_CAHIER = [['Orange', '#F26B21'], ['Bleu', '#3E8ED0'], ['Vert', '#4FB286'], ['Jaune', '#E8B23A'], ['Violet', '#9B7BE0'], ['Rose', '#E0679B'], ['Gris', '#8FA8B8']];
  const cahiersActifs = () => (S.cahiers || []).filter(x => !x.archive).sort((a, b) => a.titre.localeCompare(b.titre));
  const notesDuCahier = id => S.notes.filter(n => n.cahier_id === id && !n.archivee);
  const lienAction = id => { const a = id && parId(S.actions, id); return a ? `<span class="lien-obj">✓ ${esc(a.titre)}</span>` : ''; };
  const lienProjet = id => { const p = id && parId(S.projets, id); return p ? `<span class="lien-obj">▸ ${esc(p.titre)}</span>` : ''; };
  // Tâches proposées pour un lien : ouvertes, plus celle déjà liée.
  const actionsLiables = courant => S.actions.filter(a => a.id === courant || (['À traiter', 'À faire', 'En cours', 'En attente', 'Bloqué'].includes(a.statut) && a.type !== 'Routine'))
    .sort((a, b) => a.titre.localeCompare(b.titre));

  function ligneNote(n, { cahier = true } = {}) {
    const p = parId(S.projets, n.projet_id), ch = cahier && n.cahier_id && parId(S.cahiers || [], n.cahier_id);
    const ext = (n.contenu || '').replace(/\s+/g, ' ').slice(0, 160);
    return `<li class="ligne" data-note="${n.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="titre">${esc(n.titre)}</div>
      <div class="meta">${pastille(n.type)}${ch ? `<span class="pastille pastille-cahier" style="--cahier:${esc(ch.couleur || '#8FA8B8')}">${esc(ch.titre)}</span>` : ''}${p ? `<span>${esc(p.titre)}</span>` : ''}${lienAction(n.action_id)}${(n.mots_cles || []).map(m => `<span>#${esc(m)}</span>`).join('')}</div>${ext ? `<div class="geste extrait">${esc(ext)}${n.contenu.length > 160 ? '…' : ''}</div>` : ''}</div>
      <div class="droite">${n.date ? esc(jourDate(n.date)) : ''}</div></li>`;
  }
  function carteCahier(ch) {
    const n = notesDuCahier(ch.id).length;
    return `<button class="cahier" data-cahier="${ch.id}" style="--cahier:${esc(ch.couleur || '#8FA8B8')}"><b>${esc(ch.titre)}</b><small>${n} note${n > 1 ? 's' : ''}</small>${lienProjet(ch.projet_id)}${lienAction(ch.action_id)}</button>`;
  }

  function vueCarnet(v) {
    const f = S.filtres; const type = f.typeNote || ''; const q = (f.qn || '').toLowerCase(); const arch = !!f.archives;
    const sel = f.cahier || ''; // '' = toutes, 'aucun' = sans cahier, sinon id de cahier
    const ch = sel && sel !== 'aucun' ? parId(S.cahiers || [], sel) : null;
    if (sel && sel !== 'aucun' && !ch) f.cahier = '';
    const items = S.notes.filter(n => n.archivee === arch && (!type || n.type === type) && (!q || [n.titre, n.contenu].some(x => (x || '').toLowerCase().includes(q)))
        && (!sel || (sel === 'aucun' ? !n.cahier_id : n.cahier_id === sel)))
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.cree_le.localeCompare(a.cree_le));
    const cahiers = cahiersActifs();
    const sansCahier = S.notes.filter(n => !n.archivee && !n.cahier_id).length;
    v.innerHTML = entete(ch ? ch.titre : 'Carnet', ch ? (esc(ch.description || '') || 'Cahier') : 'Notes, idées, comptes rendus, décisions et bilans.',
      `${ch ? '<button class="btn" id="modCahier">Modifier le cahier</button>' : '<button class="btn" id="ajCahier">Nouveau cahier</button>'}<button class="btn primaire" id="ajNote">Nouvelle note</button>`) + `
      ${ch && (ch.projet_id || ch.action_id) ? `<div class="meta liens-cahier">${lienProjet(ch.projet_id)}${lienAction(ch.action_id)}</div>` : ''}
      <div class="cahiers-barre" role="tablist" aria-label="Cahiers">
        <button class="cahier-onglet" data-filtre-cahier="" aria-pressed="${!sel}">Toutes <span class="nb">${S.notes.filter(n => !n.archivee).length}</span></button>
        <button class="cahier-onglet" data-filtre-cahier="aucun" aria-pressed="${sel === 'aucun'}">Sans cahier <span class="nb">${sansCahier}</span></button>
        ${cahiers.map(x => `<button class="cahier-onglet" data-filtre-cahier="${x.id}" aria-pressed="${sel === x.id}" style="--cahier:${esc(x.couleur || '#8FA8B8')}"><i></i>${esc(x.titre)} <span class="nb">${notesDuCahier(x.id).length}</span></button>`).join('')}
      </div>
      ${!sel && cahiers.length ? `<div class="grille-cahiers">${cahiers.map(carteCahier).join('')}</div>` : ''}
      <div class="outils"><input type="search" id="qn" placeholder="Chercher dans les notes" value="${esc(f.qn || '')}" aria-label="Chercher">
        <select id="tn" aria-label="Type"><option value="">Tous les types</option>${TYPES_NOTE.map(t => `<option ${t === type ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <div class="onglets"><button aria-pressed="${!arch}" data-arch="0">Actives</button><button aria-pressed="${arch}" data-arch="1">Archives</button></div></div>
      ${bloc(`${items.length} note${items.length > 1 ? 's' : ''}`, null, items.length ? `<ul class="lignes">${items.map(n => ligneNote(n, { cahier: !ch })).join('')}</ul>` : vide(q || type ? 'Aucune note pour ces filtres.' : ch ? 'Ce cahier est vide.' : 'Le carnet est vide.'))}`;
    const qn = $('#qn');
    qn.oninput = () => { clearTimeout(vueCarnet.t); vueCarnet.t = setTimeout(() => { S.filtres.qn = qn.value; const p = qn.selectionStart; c.rendre(); const n = $('#qn'); n.focus(); n.setSelectionRange(p, p); }, 200); };
    $('#tn').onchange = e => { S.filtres.typeNote = e.target.value; c.rendre(); };
    v.querySelectorAll('[data-arch]').forEach(b => b.onclick = () => { S.filtres.archives = b.dataset.arch === '1'; c.rendre(); });
    v.querySelectorAll('[data-filtre-cahier]').forEach(b => b.onclick = () => { S.filtres.cahier = b.dataset.filtreCahier; c.rendre(); window.scrollTo(0, 0); });
    v.querySelectorAll('[data-cahier]').forEach(b => b.onclick = () => { S.filtres.cahier = b.dataset.cahier; c.rendre(); window.scrollTo(0, 0); });
    $('#ajNote').onclick = () => ficheNote({ type: 'Note', date: aujourdhui(), cahier_id: ch?.id || null, projet_id: ch?.projet_id || null, action_id: ch?.action_id || null });
    const ac = $('#ajCahier'); if (ac) ac.onclick = () => ficheCahier({});
    const mc = $('#modCahier'); if (mc) mc.onclick = () => ficheCahier(ch);
    brancher(v, '[data-note]', el => ficheNote(parId(S.notes, el.dataset.note)));
  }
  function ficheCahier(ch) {
    const n = ch.id ? notesDuCahier(ch.id).length : 0;
    fiche({ titre: ch.id ? ch.titre : 'Nouveau cahier', table: 'cahiers', ligne: { couleur: COULEURS_CAHIER[0][1], ...ch }, champs: [
      { k: 'titre', l: 'Nom du cahier', req: true, large: true, titre: true },
      { k: 'description', l: 'Description', t: 'textarea', rows: 2 },
      { k: 'couleur', l: 'Couleur', t: 'select', o: COULEURS_CAHIER.map(([l, h]) => [h, l]) },
      { k: 'projet_id', l: 'Projet lié', t: 'ref', o: () => S.projets, lib: 'titre' },
      { k: 'action_id', l: 'Tâche liée', t: 'ref', o: () => actionsLiables(ch.action_id), lib: 'titre' },
      { k: 'archive', l: 'Archivé', t: 'bool' },
    ], pied: ch.id && n ? `<p class="aide champ large" style="margin:0">Supprimer le cahier garde ses ${n} note${n > 1 ? 's' : ''}, qui passent dans « Sans cahier ».</p>` : '',
    apres: id => { if (!ch.id && S.vue === 'carnet') S.filtres.cahier = id; } });
  }
  function ficheNote(n) {
    const evt = n.action_id ? parId(S.actions, n.action_id) : null;
    const issues = n.id ? S.actions.filter(a => a.note_id === n.id) : [];
    const pied = n.id ? `<div class="champ large pied-note">
      ${evt && evt.type === 'Événement' ? `<span class="aide">Événement : ${esc(evt.titre)}${evt.planifie_debut ? ' · ' + esc(jourDate(cleJour(evt.planifie_debut))) : ''}</span>` : ''}
      ${issues.length ? `<span class="aide">${issues.length} tâche${issues.length > 1 ? 's' : ''} créée${issues.length > 1 ? 's' : ''} depuis cette note</span>` : ''}
      <button type="button" class="btn" data-creer-actions>Créer les tâches « - [ ] »</button></div>` : '';
    const d = fiche({ titre: n.id ? n.titre : 'Nouvelle note', table: 'notes', ligne: n, pied, champs: [
      { k: 'titre', l: 'Titre', req: true, large: true, titre: true },
      { k: 'type', l: 'Type', t: 'select', o: TYPES_NOTE, req: true }, { k: 'date', l: 'Date', t: 'date' },
      { k: 'contenu', l: 'Contenu', t: 'textarea', rows: 14 },
      { k: 'cahier_id', l: 'Cahier', t: 'ref', o: () => (S.cahiers || []).filter(x => !x.archive || x.id === n.cahier_id).sort((a, b) => a.titre.localeCompare(b.titre)), lib: 'titre' },
      { k: 'action_id', l: 'Tâche ou événement lié', t: 'ref', o: () => actionsLiables(n.action_id), lib: 'titre' },
      { k: 'projet_id', l: 'Projet', t: 'ref', o: () => S.projets, lib: 'titre' }, { k: 'domaine_id', l: 'Domaine', t: 'ref', o: () => S.domaines },
      { k: 'mots_cles', l: 'Mots-clés', t: 'multi', o: ['À explorer', 'Important', 'Réutilisable'] },
      { k: 'archivee', l: 'Archivée', t: 'bool' },
    ] });
    const b = d.querySelector('[data-creer-actions]');
    if (b) b.onclick = async () => {
      b.disabled = true;
      const zone = d.querySelector('[name=contenu]');
      const nouveau = await c.creerActionsDepuisNote({ ...n, projet_id: d.querySelector('[name=projet_id]').value || null, domaine_id: d.querySelector('[name=domaine_id]').value || null }, zone.value);
      if (nouveau != null) zone.value = nouveau;
      b.disabled = false;
    };
    // Choisir un cahier lié à un projet ou une tâche reprend ces liens s’ils sont vides.
    const selC = d.querySelector('[name=cahier_id]');
    if (selC) selC.addEventListener('change', () => {
      const x = parId(S.cahiers || [], selC.value); if (!x) return;
      const sp = d.querySelector('[name=projet_id]'), sa = d.querySelector('[name=action_id]');
      if (x.projet_id && sp && !sp.value) sp.value = x.projet_id;
      if (x.action_id && sa && !sa.value) sa.value = x.action_id;
    });
  }

  /* Notes et cahiers liés à un projet ou à une tâche : bloc réutilisable. */
  function blocNotesLiees({ projet_id = null, action_id = null }) {
    const cle = projet_id ? 'projet_id' : 'action_id', id = projet_id || action_id;
    const cahiers = (S.cahiers || []).filter(x => x[cle] === id && !x.archive);
    const notes = S.notes.filter(n => n[cle] === id && !n.archivee);
    const corps = cahiers.length || notes.length
      ? `${cahiers.length ? `<div class="grille-cahiers petite">${cahiers.map(carteCahier).join('')}</div>` : ''}${notes.length ? `<ul class="lignes">${notes.map(n => ligneNote(n)).join('')}</ul>` : ''}`
      : vide(projet_id ? 'Aucune note ni cahier lié à ce projet.' : 'Aucune note ni cahier lié.');
    return bloc('Notes et cahiers', cahiers.length + notes.length, corps,
      `<div class="boutons-entete"><button class="btn discret" data-nouvelle-note>+ Note</button><button class="btn discret" data-nouveau-cahier>+ Cahier</button></div>`);
  }
  function brancherNotesLiees(racine, { projet_id = null, action_id = null, titre = '', domaine_id = null, avant = () => {} }) {
    brancher(racine, '[data-note]', el => { avant(); ficheNote(parId(S.notes, el.dataset.note)); });
    racine.querySelectorAll('[data-cahier]').forEach(b => b.onclick = () => { avant(); S.vue = 'carnet'; S.filtres = { cahier: b.dataset.cahier }; history.replaceState(null, '', '#carnet'); c.rendre(); window.scrollTo(0, 0); });
    racine.querySelectorAll('[data-nouvelle-note]').forEach(b => b.onclick = () => { avant(); ficheNote({ type: 'Note', date: aujourdhui(), projet_id, action_id, domaine_id, titre: titre ? 'Note · ' + titre : '' }); });
    racine.querySelectorAll('[data-nouveau-cahier]').forEach(b => b.onclick = () => { avant(); ficheCahier({ titre, projet_id, action_id }); });
  }

  /* ================= Routines ================= */
  const JOURS_SEM = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  function realisations7j(r) {
    const depuis = plusJours(aujourdhui(), -6);
    return S.actions.filter(a => a.routine_id === r.id && a.statut === 'Terminé' && a.realisee_le && cleJour(a.realisee_le) >= depuis).length;
  }
  function vueRoutines(v) {
    const R = S.routines.slice().sort((a, b) => b.active - a.active || a.nom.localeCompare(b.nom));
    v.innerHTML = entete('Routines et équilibre', 'Tes habitudes et leur rythme sur les sept derniers jours.', '<button class="btn primaire" id="ajRout">Nouvelle routine</button>') +
      bloc('Mes pratiques', R.length, R.length ? `<ul class="lignes">${R.map(r => {
        const n = realisations7j(r); const cible = r.cible_7j; const dom = parId(S.domaines, r.domaine_id);
        const pct = cible ? Math.min(100, Math.round(100 * n / cible)) : 0;
        return `<li class="ligne ${r.active ? '' : 'ferme'}" data-routine="${r.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto"><div>
          <div class="titre">${esc(r.nom)}</div><div class="meta">${r.frequence ? `<span>${esc(r.frequence)}</span>` : ''}${r.jours?.length ? `<span>${esc(r.jours.map(j => j.slice(0, 3)).join(' '))}</span>` : ''}${r.horaire ? `<span>${esc(r.horaire)}</span>` : ''}${dom ? `<span>${esc(dom.nom)}</span>` : ''}</div>
          ${r.consigne ? `<div class="geste">${esc(r.consigne)}</div>` : ''}
          <div class="chiffres"><span>${n}${cible ? ' / ' + cible : ''} sur 7 jours</span></div>${cible ? `<div class="jauge" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ''}</div>
          <div>${r.active ? `<button class="btn" data-faitr="${r.id}">Fait aujourd’hui</button>` : ''}</div></li>`; }).join('')}</ul>`
        : vide('Aucune routine pour l’instant. Crée une habitude (ex. « Revue hebdomadaire », « Marche 30 min ») avec une cible sur 7 jours.'));
    $('#ajRout').onclick = () => ficheRoutine({ active: true, frequence: 'Hebdomadaire', type: 'Habitude' });
    v.querySelectorAll('[data-faitr]').forEach(b => b.onclick = async e => {
      e.stopPropagation(); const r = parId(S.routines, b.dataset.faitr);
      const maintenant = new Date().toISOString();
      const { error } = await sb.from('actions').insert({ titre: r.nom, type: 'Routine', statut: 'Terminé', routine_id: r.id, realisee_le: maintenant, planifie_debut: depuisLocal(aujourdhui() + 'T00:00'), journee_entiere: true, domaine_id: r.domaine_id, hors_projet: true });
      if (error) return toast('Échec : ' + error.message);
      toast('Bravo : ' + r.nom); rafraichir();
    });
    brancher(v, '[data-routine]', el => ficheRoutine(parId(S.routines, el.dataset.routine)));
  }
  function ficheRoutine(r) {
    fiche({ titre: r.id ? r.nom : 'Nouvelle routine', table: 'routines', ligne: r, champs: [
      { k: 'nom', l: 'Routine', req: true, large: true, titre: true },
      { k: 'type', l: 'Type', t: 'select', o: ['Habitude', 'Entretien', 'Administration', 'Revue'] },
      { k: 'frequence', l: 'Fréquence', t: 'select', o: ['Quotidienne', 'Hebdomadaire', 'Mensuelle', 'Trimestrielle', 'Annuelle', 'Personnalisée'] },
      { k: 'jours', l: 'Jours', t: 'multi', o: JOURS_SEM }, { k: 'horaire', l: 'Horaire souhaité', ph: 'Matin, 6 h 30…' },
      { k: 'cible_7j', l: 'Cible sur 7 jours', t: 'number', step: 1 }, { k: 'domaine_id', l: 'Domaine', t: 'ref', o: () => S.domaines },
      { k: 'consigne', l: 'Consigne', t: 'textarea', rows: 2 }, { k: 'active', l: 'Active', t: 'bool' },
    ] });
  }

  /* ================= Revue hebdomadaire ================= */
  function semaineIso(cle) { const d = new Date(cle + 'T12:00:00'); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); const a = new Date(d.getFullYear(), 0, 4); return `${d.getFullYear()}-S${pad(1 + Math.round(((d - a) / 864e5 - 3 + (a.getDay() + 6) % 7) / 7))}`; }
  const CHECKLIST = [
    'Vider les captures : classer, planifier, déléguer ou abandonner.',
    'Traiter les retards et les blocages; prévoir les relances.',
    'Vérifier les jalons et les rendez-vous des deux prochaines semaines.',
    'Donner une prochaine action à chaque projet actif.',
    'Choisir le résultat principal de la semaine et les projets qui peuvent attendre.',
    'Avant d’ouvrir un nouveau chantier, décider lequel ralentir ou mettre en pause.',
    'Vérifier la charge prévue et laisser une marge.',
    'Ajuster les routines qui ne correspondent plus à la réalité.',
    'Vérifier les renouvellements et fins d’essai des abonnements.',
  ];
  function vueRevue(v) {
    const sem = semaineIso(aujourdhui()); const cle = 'orbite-revue-' + sem;
    let coches = []; try { coches = JSON.parse(localStorage.getItem(cle) || '[]'); } catch { }
    const auj = aujourdhui(), dans14 = plusJours(auj, 14);
    const captures = S.actions.filter(a => a.statut === 'À traiter');
    const retards = S.actions.filter(a => enRetard(a) || (['Bloqué', 'En attente'].includes(a.statut)));
    const sansSuite = S.projets.filter(p => p.statut === 'Actif' && !p.prochaine_action);
    const charge = S.actions.filter(a => ouvert(a) && a.planifie_debut && cleJour(a.planifie_debut) >= auj && cleJour(a.planifie_debut) <= dans14);
    const minutes = charge.reduce((s, a) => s + (a.duree_min || (a.planifie_fin ? (new Date(a.planifie_fin) - new Date(a.planifie_debut)) / 6e4 : 0)), 0);
    const abos = S.abonnements.filter(a => ['Actif', 'Essai'].includes(a.statut) && [a.prochaine_facturation, a.fin_essai].some(d => d && d >= auj && d <= dans14));
    const aCompleter = S.actions.filter(a => manquants(a).length);
    v.innerHTML = entete('Revue hebdomadaire', `${esc(sem)} · Vider ce qui s’accumule, débloquer les projets, choisir une semaine réaliste. Environ 20 minutes.`) + `
      <div class="grille">
        <div class="colonne">
          ${bloc('1. Vider les captures', captures.length, liste(captures, 'Aucune capture à trier.'))}
          ${bloc('2. Traiter les retards et les blocages', retards.length, liste(retards, 'Aucun retard ni blocage.'))}
          ${bloc('3. Donner une suite aux projets', sansSuite.length, sansSuite.length ? sansSuite.map(c.carteProjet).join('') : vide('Chaque projet actif a une prochaine action.'))}
          ${bloc('4. Vérifier la charge des 14 prochains jours', charge.length, `<div class="vide" style="color:var(--craie)">${charge.length} élément(s) planifié(s), environ ${Math.round(minutes / 60)} h réservées.</div>${liste(charge.sort((a, b) => a.planifie_debut.localeCompare(b.planifie_debut)), '')}`)}
          ${abos.length ? bloc('5. Abonnements à décider', abos.length, `<ul class="lignes">${abos.map(a => `<li class="ligne" style="grid-template-columns:minmax(0,1fr) auto" data-aller="abonnements"><div><div class="titre">${esc(a.nom)}</div><div class="meta"><span>${esc(jourDate(a.fin_essai || a.prochaine_facturation))}</span>${a.decision ? `<span>${esc(a.decision)}</span>` : ''}</div></div><div class="droite">${fmtArgent(a.montant)}</div></li>`).join('')}</ul>`) : ''}
          ${aCompleter.length ? bloc('Fiches à corriger', aCompleter.length, liste(aCompleter, '')) : ''}
        </div>
        <div class="colonne">${c.blocBienEtre ? c.blocBienEtre() : ''}${bloc('Ma checklist', `${coches.length}/${CHECKLIST.length}`, `<ul class="lignes">${CHECKLIST.map((t, i) => `<li class="ligne ${coches.includes(i) ? 'ferme' : ''}" style="grid-template-columns:22px minmax(0,1fr)"><button class="coche ${coches.includes(i) ? 'fait' : ''}" data-check="${i}" aria-label="${esc(t)}"></button><div class="titre" style="font-weight:400">${esc(t)}</div></li>`).join('')}</ul>
          <div class="pied-bloc"><span class="aide">Termine par un résultat principal pour la semaine, puis note ton bilan dans le carnet.</span><button class="btn" id="bilan">Écrire le bilan</button></div>`)}</div>
      </div>`;
    v.querySelectorAll('[data-check]').forEach(b => b.onclick = e => {
      e.stopPropagation(); const i = +b.dataset.check;
      coches = coches.includes(i) ? coches.filter(x => x !== i) : [...coches, i];
      try { localStorage.setItem(cle, JSON.stringify(coches)); } catch { }
      c.rendre();
    });
    v.querySelectorAll('[data-aller]').forEach(el => el.onclick = () => { S.vue = el.dataset.aller; c.rendre(); });
    $('#bilan').onclick = () => ficheNote({ type: 'Bilan', date: auj, titre: `Revue ${sem}`, contenu: 'Résultat principal de la semaine :\n\nCe qui avance :\n\nCe qui attend :\n\nÀ ralentir ou mettre en pause :\n' });
  }

  /* ================= Organigramme ================= */
  const NIVEAUX = { 1: 'Présidence / DG', 2: 'VP exécutive / principale', 3: 'Vice-présidence', 4: 'Direction principale', 5: 'Direction', 6: 'Direction adjointe', 7: 'Gestion / supervision', 8: 'Chef d’équipe', 9: 'Professionnel / spécialiste', 10: 'Technicien / soutien' };
  /* Périmètre de l’organigramme : toutes les compagnies, une compagnie ou une unité (et ses sous-unités). */
  const sousUnites = id => { const r = new Set([id]); let ajout = true; while (ajout) { ajout = false; S.unites.forEach(u => { if (u.parent_id && r.has(u.parent_id) && !r.has(u.id)) { r.add(u.id); ajout = true; } }); } return r; };
  const compagnieDe = id => { let u = parId(S.unites, id), garde = 0; while (u?.parent_id && garde++ < 20) u = parId(S.unites, u.parent_id); return u?.id || null; };
  function perimetre() {
    const id = S.filtres.orgUnite;
    const u = id && parId(S.unites, id);
    if (!u) return null;
    const unites = sousUnites(u.id), cie = compagnieDe(u.id), estCie = !u.parent_id;
    // Une personne est gardée si elle appartient à la compagnie (ou si sa compagnie n’est pas renseignée).
    const garderPersonne = x => !x.compagnie_id || x.compagnie_id === cie;
    const tousTit = pid => S.titulaires.filter(t => t.poste_id === pid).map(t => parId(S.personnes, t.personne_id)).filter(Boolean);
    const postes = new Set(S.postes.filter(p => unites.has(p.unite_id) || (estCie && tousTit(p.id).some(x => x.compagnie_id === cie))).map(p => p.id));
    return { postes, unites, garderPersonne };
  }
  const titulaires = pid => { const pr = perimetre(); return S.titulaires.filter(t => t.poste_id === pid).map(t => parId(S.personnes, t.personne_id)).filter(Boolean).filter(x => !pr || pr.garderPersonne(x)); };
  const posteVisible = p => { const pr = perimetre(); return !pr || pr.postes.has(p.id); };
  // Un poste est une racine s’il n’a pas de supérieur visible dans le périmètre.
  const racinePoste = p => posteVisible(p) && (!p.superieur_id || !posteVisible(parId(S.postes, p.superieur_id) || {}));
  function optionsUnites() {
    const lignes = [];
    const ajouter = (u, n) => { lignes.push(`<option value="${u.id}" ${S.filtres.orgUnite === u.id ? 'selected' : ''}>${'\u00a0\u00a0'.repeat(n)}${n ? '└ ' : ''}${esc(u.nom)}</option>`);
      S.unites.filter(x => x.parent_id === u.id).sort((a, b) => a.nom.localeCompare(b.nom)).forEach(x => ajouter(x, n + 1)); };
    S.unites.filter(u => !u.parent_id).sort((a, b) => (a.categorie !== 'Organisation') - (b.categorie !== 'Organisation') || a.nom.localeCompare(b.nom)).forEach(u => ajouter(u, 0));
    return lignes.join('');
  }
  function noeudPoste(p, profondeur = 0) {
    const enfants = S.postes.filter(x => x.superieur_id === p.id && posteVisible(x)).sort((a, b) => (a.niveau || 99) - (b.niveau || 99) || a.titre.localeCompare(b.titre));
    const tit = titulaires(p.id); const u = parId(S.unites, p.unite_id);
    const moi = tit.some(x => x.notion_id === '3f7d3833158f817d866ad8dfd702076b');
    return `<li class="noeud ${moi ? 'moi' : ''}">
      <div class="poste" data-poste="${p.id}" role="button" tabindex="0">
        <div class="titre">${esc(p.titre)}${p.statut !== 'Pourvu' ? ' ' + pastille(p.statut, p.statut === 'Vacant' ? 'st-Bloqué' : 'st-En attente') : ''}</div>
        <div class="meta">${tit.length ? `<span>${tit.map(x => `<a href="#" data-pers="${x.id}">${esc(x.nom)}</a>`).join(', ')}</span>` : '<span>Aucun titulaire</span>'}${u ? `<span>${esc(u.nom)}</span>` : ''}</div>
      </div>
      ${enfants.length ? `<details ${profondeur < 2 || enfants.some(e => titulaires(e.id).some(x => x.notion_id === '3f7d3833158f817d866ad8dfd702076b')) ? 'open' : ''}><summary>${enfants.length} poste${enfants.length > 1 ? 's' : ''} rattaché${enfants.length > 1 ? 's' : ''}</summary><ul class="arbre">${enfants.map(e => noeudPoste(e, profondeur + 1)).join('')}</ul></details>` : ''}
    </li>`;
  }
  function noeudUnite(u) {
    const sous = S.unites.filter(x => x.parent_id === u.id).sort((a, b) => a.nom.localeCompare(b.nom));
    const postes = S.postes.filter(p => p.unite_id === u.id).sort((a, b) => (a.niveau || 99) - (b.niveau || 99));
    return `<li class="noeud"><div class="poste" data-unite="${u.id}" role="button" tabindex="0"><div class="titre">${esc(u.nom)} ${pastille(u.categorie)}</div>
      <div class="meta">${postes.map(p => `<span>${esc(p.titre)}${titulaires(p.id).length ? ' : ' + titulaires(p.id).map(x => esc(x.nom)).join(', ') : ''}</span>`).join('') || '<span>Aucun poste</span>'}</div></div>
      ${sous.length ? `<ul class="arbre">${sous.map(noeudUnite).join('')}</ul>` : ''}</li>`;
  }
  /* ---------- Organigramme en diagramme ---------- */
  // Arbre de haut en bas. Quand tous les enfants d’un nœud sont des feuilles, ils s’empilent en colonne pour rester compacts.
  const MOI_NOTION = '3f7d3833158f817d866ad8dfd702076b';
  const enfantsPoste = p => S.postes.filter(x => x.superieur_id === p.id && posteVisible(x)).sort((a, b) => (a.niveau || 99) - (b.niveau || 99) || a.titre.localeCompare(b.titre));
  const enfantsUnite = u => S.unites.filter(x => x.parent_id === u.id).sort((a, b) => a.nom.localeCompare(b.nom));
  function boitePoste(p) {
    const pr = perimetre();
    const tit = titulaires(p.id), u0 = parId(S.unites, p.unite_id), u = u0 && (!pr || pr.unites.has(u0.id)) ? u0 : null, moi = tit.some(x => x.notion_id === MOI_NOTION);
    return `<div class="oc-boite ${moi ? 'moi' : ''} ${p.statut !== 'Pourvu' ? 'vacant' : ''}" data-poste="${p.id}" role="button" tabindex="0">
      <b>${esc(p.titre)}</b>
      <span class="oc-noms">${tit.length ? tit.map(x => `<a href="#" data-pers="${x.id}">${esc(x.nom)}</a>`).join(', ') : `<i>${esc(p.statut === 'Pourvu' ? 'Aucun titulaire' : p.statut)}</i>`}</span>
      ${u ? `<small>${esc(u.nom)}</small>` : ''}</div>`;
  }
  function boiteUnite(u) {
    const postes = S.postes.filter(p => p.unite_id === u.id);
    return `<div class="oc-boite" data-unite="${u.id}" role="button" tabindex="0" title="${esc(u.mandat || '')}"><b>${u.code ? `<span class="oc-code">${esc(u.code)}</span> ` : ''}${esc(u.nom)}</b><small>${esc(u.categorie || '')}${postes.length ? ` · ${postes.length} poste${postes.length > 1 ? 's' : ''}` : ''}</small></div>`;
  }
  function noeudDiagramme(x, enfants, boite) {
    const e = enfants(x);
    const pile = e.length > 2 && e.every(y => !enfants(y).length);
    return `<li>${boite(x)}${e.length ? `<ul class="${pile ? 'oc-pile' : ''}">${e.map(y => noeudDiagramme(y, enfants, boite)).join('')}</ul>` : ''}</li>`;
  }
  function diagramme(mode, racinesP, racinesU) {
    const z = +(S.filtres.orgZoom || 1);
    const arbre = mode === 'postes' ? racinesP.map(p => noeudDiagramme(p, enfantsPoste, boitePoste)).join('') : racinesU.map(u => noeudDiagramme(u, enfantsUnite, boiteUnite)).join('');
    return `<section class="bloc oc-bloc"><header><h2>Diagramme</h2><div class="oc-zoom"><button class="btn discret" data-zoom="-1" aria-label="Réduire">−</button><span>${Math.round(z * 100)} %</span><button class="btn discret" data-zoom="1" aria-label="Agrandir">+</button><button class="btn discret" data-zoom="0">Ajuster</button></div></header>
      <div class="oc-zone"><ul class="oc" style="zoom:${z}">${arbre}</ul></div></section>`;
  }
  const vueOrgMemo = () => { try { return localStorage.getItem('orbite-org-vue') || 'liste'; } catch { return 'liste'; } };

  function vueOrganigramme(v) {
    if (S.filtres.orgUnite === undefined) { try { S.filtres.orgUnite = localStorage.getItem('orbite-org-unite') || ''; } catch { S.filtres.orgUnite = ''; } }
    if (S.filtres.orgUnite && !parId(S.unites, S.filtres.orgUnite)) S.filtres.orgUnite = '';
    const mode = S.filtres.org || 'postes';
    const affichage = S.filtres.orgVue || vueOrgMemo();
    const racines = S.postes.filter(racinePoste).sort((a, b) => (a.niveau || 99) - (b.niveau || 99) || a.titre.localeCompare(b.titre));
    const uFiltre = S.filtres.orgUnite && parId(S.unites, S.filtres.orgUnite);
    const unitesRacines = (uFiltre ? [uFiltre] : S.unites.filter(u => !u.parent_id)).sort((a, b) => (a.categorie !== 'Organisation') - (b.categorie !== 'Organisation') || a.nom.localeCompare(b.nom));
    const pr = perimetre();
    const postesVus = pr ? S.postes.filter(p => pr.postes.has(p.id)) : S.postes;
    const vacants = postesVus.filter(p => p.statut !== 'Pourvu').length;
    v.innerHTML = entete('Organigramme et structure', `${uFiltre ? esc(uFiltre.nom) + ' · ' : ''}${postesVus.length} postes, ${pr ? pr.unites.size : S.unites.length} unités${vacants ? `, ${vacants} poste(s) vacant(s) ou à renseigner` : ''}.`,
      `<button class="btn" id="ajUnite">Ajouter une unité</button><button class="btn primaire" id="ajPoste">Ajouter un poste</button>`) + `
      <div class="outils"><div class="onglets"><button aria-pressed="${mode === 'postes'}" data-org="postes">Postes et hiérarchie</button><button aria-pressed="${mode === 'unites'}" data-org="unites">Unités</button></div>
        <div class="onglets"><button aria-pressed="${affichage === 'liste'}" data-orgvue="liste">Liste</button><button aria-pressed="${affichage === 'diagramme'}" data-orgvue="diagramme">Diagramme</button></div>
        <select id="orgUnite" aria-label="Compagnie ou unité"><option value="">Toutes les compagnies</option>${optionsUnites()}</select></div>
      ${affichage === 'diagramme' ? diagramme(mode, racines, unitesRacines)
        : `<section class="bloc organigramme"><ul class="arbre racine">${mode === 'postes' ? racines.map(p => noeudPoste(p)).join('') : unitesRacines.map(noeudUnite).join('')}</ul></section>`}`;
    v.querySelectorAll('[data-org]').forEach(b => b.onclick = () => { S.filtres.org = b.dataset.org; c.rendre(); });
    v.querySelector('#orgUnite').onchange = e => { S.filtres.orgUnite = e.target.value; S.filtres.orgZoom = 0; try { localStorage.setItem('orbite-org-unite', e.target.value); } catch { } c.rendre(); };
    v.querySelectorAll('[data-orgvue]').forEach(b => b.onclick = () => { S.filtres.orgVue = b.dataset.orgvue; try { localStorage.setItem('orbite-org-vue', b.dataset.orgvue); } catch { } c.rendre(); });
    const zone = v.querySelector('.oc-zone'), oc = v.querySelector('.oc');
    if (zone && oc) {
      // « Ajuster » : la plus grande échelle qui fait tenir tout l’arbre en largeur (entre 40 % et 100 %).
      const ajuster = () => { oc.style.zoom = 1; const z = Math.max(.4, Math.min(1, (zone.clientWidth - 30) / oc.getBoundingClientRect().width)); S.filtres.orgZoom = Math.floor(z * 20) / 20; };
      if (!S.filtres.orgZoom) { ajuster(); oc.style.zoom = S.filtres.orgZoom; v.querySelector('.oc-zoom span').textContent = Math.round(S.filtres.orgZoom * 100) + ' %'; }
      v.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => {
        const d = +b.dataset.zoom;
        if (d === 0) ajuster(); else S.filtres.orgZoom = Math.max(.25, Math.min(2, Math.round(((S.filtres.orgZoom || 1) + d * .1) * 10) / 10));
        c.rendre();
      });
      // Roulette (ou pincement sur pavé tactile) : zoom centré sur le pointeur, sans redessiner.
      const etiquette = v.querySelector('.oc-zoom span');
      zone.addEventListener('wheel', e => {
        e.preventDefault();
        const z0 = S.filtres.orgZoom || 1;
        const z1 = Math.max(.25, Math.min(2, z0 * Math.exp(-e.deltaY * (e.deltaMode === 1 ? .05 : .0015))));
        if (z1 === z0) return;
        const r = zone.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
        const px = (zone.scrollLeft + mx) / z0, py = (zone.scrollTop + my) / z0;
        oc.style.zoom = z1; S.filtres.orgZoom = z1;
        zone.scrollLeft = px * z1 - mx; zone.scrollTop = py * z1 - my;
        etiquette.textContent = Math.round(z1 * 100) + ' %';
      }, { passive: false });
      // Glisser pour se déplacer dans le diagramme (souris); le tactile défile nativement.
      let glisse = null;
      zone.onpointerdown = e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; glisse = { x: e.clientX, y: e.clientY, l: zone.scrollLeft, t: zone.scrollTop, bouge: false }; };
      zone.onpointermove = e => { if (!glisse) return; const dx = e.clientX - glisse.x, dy = e.clientY - glisse.y;
        if (!glisse.bouge && Math.hypot(dx, dy) > 5) { glisse.bouge = true; zone.classList.add('glisse'); zone.setPointerCapture(e.pointerId); }
        if (glisse.bouge) { zone.scrollLeft = glisse.l - dx; zone.scrollTop = glisse.t - dy; } };
      zone.onpointerup = zone.onpointercancel = () => { if (glisse?.bouge) zone.addEventListener('click', ev => ev.stopPropagation(), { capture: true, once: true }); glisse = null; zone.classList.remove('glisse'); };
      // Centrer sur mon poste.
      const moi = oc.querySelector('.oc-boite.moi');
      if (moi) requestAnimationFrame(() => { const r = moi.getBoundingClientRect(), rz = zone.getBoundingClientRect(); zone.scrollLeft += r.left - rz.left - zone.clientWidth / 2 + r.width / 2; });
    }
    $('#ajPoste').onclick = () => fichePoste({ statut: 'Pourvu' });
    $('#ajUnite').onclick = () => ficheUnite({ categorie: 'Département', actif: true });
    v.querySelectorAll('[data-pers]').forEach(a => a.onclick = e => { e.preventDefault(); e.stopPropagation(); c.ouvrirPersonne(parId(S.personnes, a.dataset.pers)); });
    brancher(v, '[data-poste]', el => fichePoste(parId(S.postes, el.dataset.poste)));
    brancher(v, '[data-unite]', el => ficheUnite(parId(S.unites, el.dataset.unite)));
  }
  function fichePoste(p) {
    const tit = p.id ? S.titulaires.filter(t => t.poste_id === p.id).map(t => t.personne_id) : [];
    fiche({ titre: p.id ? p.titre : 'Nouveau poste', table: 'postes', ligne: { ...p, _tit: tit }, champs: [
      { k: 'titre', l: 'Poste', req: true, large: true, titre: true },
      { k: 'niveau', l: 'Niveau', t: 'select', num: true, o: Object.entries(NIVEAUX).map(([k, l]) => [k, `${pad(k)} — ${l}`]) },
      { k: 'statut', l: 'Statut', t: 'select', o: ['Pourvu', 'Vacant', 'À renseigner'], req: true },
      { k: 'unite_id', l: 'Unité', t: 'ref', o: () => S.unites },
      { k: 'superieur_id', l: 'Supérieur hiérarchique', t: 'ref', o: () => S.postes.filter(x => x.id !== p.id).sort((a, b) => a.titre.localeCompare(b.titre)), lib: 'titre' },
      { k: 'mission', l: 'Mission', t: 'textarea', rows: 2 },
    ], pied: `<label class="champ large"><span>Titulaires (Ctrl ou Cmd pour en choisir plusieurs)</span><select name="_tit" multiple size="6">${S.personnes.map(x => `<option value="${x.id}" ${tit.includes(x.id) ? 'selected' : ''}>${esc(x.nom)}</option>`).join('')}</select></label>`,
    apres: async (id, val, fd) => {
      await sb.from('postes_titulaires').delete().eq('poste_id', id);
      const ids = fd.getAll('_tit');
      if (ids.length) await sb.from('postes_titulaires').insert(ids.map(pid => ({ poste_id: id, personne_id: pid })));
    } });
  }
  function ficheUnite(u) {
    fiche({ titre: u.id ? u.nom : 'Nouvelle unité', table: 'unites', ligne: u, champs: [
      { k: 'nom', l: 'Unité', req: true, large: true, titre: true },
      { k: 'categorie', l: 'Catégorie', t: 'select', o: ['Organisation', 'Division', 'Direction', 'Site', 'Département', 'Équipe'], req: true },
      { k: 'code', l: 'Code' }, { k: 'parent_id', l: 'Unité parente', t: 'ref', o: () => S.unites.filter(x => x.id !== u.id) },
      { k: 'mandat', l: 'Mandat', t: 'textarea', rows: 3 }, { k: 'actif', l: 'Active', t: 'bool' },
    ] });
  }

  /* ================= Plus (menu mobile) ================= */
  // Thèmes : la préférence suit le compte (réglage « theme ») et est copiée sur l’appareil pour s’appliquer sans flash.
  const THEMES = [
    { k: 'classique', l: 'ORBITE', d: 'Anthracite et orange', c: ['#0B1F2A', '#F26B21', '#E6EDF2'] },
    { k: 'cyberpunk', l: 'Cyberpunk', d: 'Néon magenta et cyan', c: ['#07060D', '#FF2E88', '#00E5FF'] },
  ];
  function appliquerTheme(k) {
    const lien = document.getElementById('themeCss');
    if (lien) lien.media = k === 'cyberpunk' ? 'all' : 'not all';
    document.documentElement.dataset.theme = k;
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = k === 'cyberpunk' ? '#07060D' : '#0B1F2A';
    try { localStorage.setItem('orbite-theme', k); } catch { }
  }
  const themeActuel = () => { try { return localStorage.getItem('orbite-theme') || 'classique'; } catch { return 'classique'; } };
  function vuePlus(v) {
    const actuel = themeActuel();
    v.innerHTML = entete('Tous les espaces', 'Choisis un module.') + `<section class="bloc choix-theme"><header><h2>Thème</h2></header><div class="themes" role="radiogroup" aria-label="Thème">${THEMES.map(t => `<button class="theme ${t.k === actuel ? 'choisi' : ''}" role="radio" aria-checked="${t.k === actuel}" data-theme="${t.k}"><span class="nuances">${t.c.map(x => `<i style="background:${x}"></i>`).join('')}</span><b>${t.l}</b><small>${t.d}</small></button>`).join('')}</div></section><div class="grille-modules">${c.MODULES.filter(m => !m.principal).map(m => `<button class="tuile" data-vue="${m.k}">${c.ico(m.k)}<span>${m.l}</span></button>`).join('')}</div>`;
    v.querySelectorAll('.tuile').forEach(b => b.onclick = () => { S.vue = b.dataset.vue; S.filtres = {}; c.rendre(); });
    v.querySelectorAll('[data-theme]').forEach(b => b.onclick = async () => {
      const k = b.dataset.theme; appliquerTheme(k); vuePlus(v);
      const { error } = await sb.from('reglages').upsert({ cle: 'theme', valeur: k });
      if (!error) { const r = S.reglages.find(x => x.cle === 'theme'); if (r) r.valeur = k; else S.reglages.push({ cle: 'theme', valeur: k }); }
    });
  }
  // Au chargement : le thème du compte l’emporte (choix fait sur un autre appareil).
  function synchroTheme() { const k = S.reglages.find(x => x.cle === 'theme')?.valeur; if (k && k !== themeActuel()) appliquerTheme(k); }

  /* ================= Encarts de l'accueil ================= */
  function encartsAccueil() {
    const traj = trajetsDuJour();
    const entretiens = S.entretiens.filter(e => e.actif).map(e => [e, statutEntretien(e)]).filter(([, s]) => ['retard', 'mois'].includes(s.cle));
    const achats = S.achats.filter(a => ['À compléter', 'À acheter'].includes(a.statut));
    const dans7 = plusJours(aujourdhui(), 7);
    const abos = S.abonnements.filter(a => ['Actif', 'Essai'].includes(a.statut) && [a.prochaine_facturation, a.fin_essai].some(d => d && d >= aujourdhui() && d <= dans7));
    const lecture = S.livres.find(l => l.statut === 'En lecture');
    const lignes = [];
    if (entretiens.length) lignes.push(['vehicules', `${entretiens.length} entretien${entretiens.length > 1 ? 's' : ''} à faire`, entretiens.map(([e]) => e.entretien + ' · ' + (parId(S.vehicules, e.vehicule_id)?.modele || '')).slice(0, 2).join(', ')]);
    if (achats.length) lignes.push(['achats', `${achats.length} article${achats.length > 1 ? 's' : ''} à acheter`, achats.slice(0, 3).map(a => a.item).join(', ')]);
    if (abos.length) lignes.push(['abonnements', `${abos.length} facturation${abos.length > 1 ? 's' : ''} cette semaine`, abos.map(a => `${a.nom} ${fmtArgent(a.montant)}`).join(', ')]);
    if (lecture) lignes.push(['bibliotheque', 'En lecture : ' + lecture.titre, lecture.longueur ? `${lecture.position || 0} / ${lecture.longueur}` : '']);
    return `
      ${bloc('Transports du jour', traj.length, traj.length ? `<ul class="lignes">${traj.map(t => `<li class="ligne" style="grid-template-columns:52px minmax(0,1fr) auto" data-aller="transports"><div class="heure">${esc(fmtHeure.format(new Date(t.date_heure)))}</div><div><div class="titre">${esc(t.titre.split(' • ').pop())}</div><div class="meta"><span>${esc(t.enfants || '')}</span></div></div><div>${t.responsable ? pastille(t.responsable, 'st-Terminé') : pastille('À attribuer', 'st-Bloqué')}</div></li>`).join('')}</ul>` : vide('Aucun transport aujourd’hui.'), '<button class="btn discret" data-aller="transports">Semaine</button>')}
      ${lignes.length ? bloc('À surveiller', null, `<ul class="lignes">${lignes.map(([k, t, d]) => `<li class="ligne" style="grid-template-columns:22px minmax(0,1fr)" data-aller="${k}"><span class="ico-mini">${c.ico(k)}</span><div><div class="titre">${esc(t)}</div>${d ? `<div class="meta"><span>${esc(d)}</span></div>` : ''}</div></li>`).join('')}</ul>`) : ''}`;
  }

  /* ================= Projet : budget ================= */
  const TAXES_QC = 14.975;
  const htLigne = l => (+l.quantite || 0) * (+l.prix_unitaire_ht || 0) + (+l.heures || 0) * (+l.tarif_horaire_ht || 0) + (+l.autres_frais_ht || 0);
  const ttcLigne = l => htLigne(l) * (1 + (l.taxes_pct ?? TAXES_QC) / 100);
  const STATUTS_BUDGET = ['À chiffrer', 'Estimation', 'Soumission', 'Engagé', 'Payé', 'Exclu'];
  function blocBudget(p) {
    const lignes = S.budget.filter(l => l.projet_id === p.id);
    if (!lignes.length && !p.budget_prevu) return bloc('Budget', null, vide('Aucun poste de dépense.'), `<button class="btn discret" data-ajbudget="${p.id}">Ajouter un poste</button>`);
    const actives = lignes.filter(l => l.statut !== 'Exclu');
    const somme = f => actives.reduce((t, l) => t + (f(l) || 0), 0);
    const ht = somme(htLigne), ttc = somme(ttcLigne), engage = somme(l => +l.engage_ttc), paye = somme(l => +l.paye_ttc);
    const reserve = ttc * (+p.reserve_pct || 0) / 100;
    const aChiffrer = actives.filter(l => l.statut === 'À chiffrer' || !htLigne(l)).length;
    const valides = actives.filter(l => l.chiffrage_valide).length;
    const lots = [...new Set(lignes.map(l => l.lot || 'Sans lot'))].sort();
    const ouverts = S.filtres.lotsOuverts || (S.filtres.lotsOuverts = new Set());
    const tuile = (lib, val, sous = '') => `<div class="tuile-budget"><span>${lib}</span><strong>${val}</strong>${sous ? `<small>${sous}</small>` : ''}</div>`;
    const ecart = p.budget_prevu ? (+p.budget_prevu) - (ttc + reserve) : null;
    const corps = `
      <div class="tuiles-budget">
        ${tuile('Estimé HT', fmtArgent(ht))}
        ${tuile('Estimé TTC', fmtArgent(ttc + reserve), p.reserve_pct ? `dont réserve ${p.reserve_pct} % : ${fmtArgent(reserve)}` : 'réserve 0 %')}
        ${tuile('Engagé / payé', `${fmtArgent(engage)} / ${fmtArgent(paye)}`)}
        ${tuile('Chiffrage', `${actives.length - aChiffrer} / ${actives.length}`, `${aChiffrer} à chiffrer · ${valides} validés`)}
        ${p.budget_prevu ? tuile('Budget prévu', fmtArgent(p.budget_prevu), `<span class="${ecart < 0 ? 'neg' : ''}">écart ${fmtArgent(ecart)}</span>`) : ''}
      </div>
      ${lots.map(lot => {
        const ls = lignes.filter(l => (l.lot || 'Sans lot') === lot).sort((a, b) => (a.statut === 'À chiffrer') - (b.statut === 'À chiffrer') || a.poste.localeCompare(b.poste));
        const tLot = ls.filter(l => l.statut !== 'Exclu').reduce((t, l) => t + ttcLigne(l), 0);
        const nbAC = ls.filter(l => l.statut === 'À chiffrer').length;
        return `<details class="lot-budget" data-lot="${esc(lot)}" ${ouverts.has(lot) ? 'open' : ''}><summary><span class="titre">${esc(lot)}</span><span class="meta">${ls.length} poste${ls.length > 1 ? 's' : ''}${nbAC ? ` · ${nbAC} à chiffrer` : ''}</span><span class="montant">${fmtArgent(tLot)}</span></summary>
          <ul class="lignes">${ls.map(l => `<li class="ligne ligne-budget ${l.statut === 'Exclu' ? 'exclu' : ''}" data-budget="${l.id}" role="button" tabindex="0"><div><div class="titre">${esc(l.poste)}</div><div class="meta">${pastille(l.statut, l.statut === 'À chiffrer' ? 'st-Bloqué' : ['Engagé', 'Payé'].includes(l.statut) ? 'st-Terminé' : '')}${l.quantite != null ? `<span>${+l.quantite} ${esc(l.unite || '')} × ${fmtArgent(l.prix_unitaire_ht)}</span>` : ''}${l.fournisseur ? `<span>${esc(l.fournisseur)}</span>` : ''}${l.chiffrage_valide ? '<span>✓ validé</span>' : ''}${(() => { const ach = S.achats.filter(x => x.budget_ligne_id === l.id && x.statut !== 'Annulé'); return ach.length ? `<span>${ach.length} achat${ach.length > 1 ? 's' : ''}${ach.some(x => x.facture_chemin) ? ' · facture' : ''}</span>` : ''; })()}</div></div><div class="droite">${htLigne(l) ? fmtArgent(ttcLigne(l)) : '—'}</div></li>`).join('')}</ul></details>`;
      }).join('')}
      <p class="note-budget">TTC calculé avec ${TAXES_QC} % (TPS + TVQ) quand une ligne n’a pas de taux.</p>`;
    return bloc('Budget', lignes.length, corps, `<div class="boutons"><button class="btn discret" data-reserve="${p.id}">Réserve</button><button class="btn discret" data-ajbudget="${p.id}">Ajouter</button></div>`, 'bloc-budget');
  }
  function ficheBudget(l) {
    fiche({ titre: l.id ? l.poste : 'Nouveau poste de dépense', table: 'budget_lignes', ligne: l, champs: [
      { k: 'poste', l: 'Poste de dépense', req: true, large: true, titre: true },
      { k: 'lot', l: 'Lot', ph: 'ex. 04 · Plomberie' },

      { k: 'statut', l: 'Statut', t: 'select', o: STATUTS_BUDGET, req: true },
      { section: 'Matériel' }, { k: 'quantite', l: 'Quantité', t: 'number' }, { k: 'unite', l: 'Unité' }, { k: 'prix_unitaire_ht', l: 'Prix unitaire HT', t: 'number' },
      { section: 'Main-d’œuvre et frais' }, { k: 'heures', l: 'Heures', t: 'number' }, { k: 'tarif_horaire_ht', l: 'Tarif horaire HT', t: 'number' }, { k: 'autres_frais_ht', l: 'Autres frais HT', t: 'number' },
      { k: 'taxes_pct', l: `Taxes % (vide = ${TAXES_QC})`, t: 'number' },
      { section: 'Suivi' }, { k: 'engage_ttc', l: 'Engagé TTC', t: 'number' }, { k: 'paye_ttc', l: 'Payé TTC', t: 'number' },
      { k: 'fournisseur', l: 'Fournisseur' }, { k: 'date_paiement', l: 'Paiement prévu', t: 'date' }, { k: 'chiffrage_valide', l: 'Chiffrage validé', t: 'bool' },
      { k: 'notes', l: 'Notes / hypothèses', t: 'textarea', rows: 3 },
    ], avant: val => { val.projet_id = l.projet_id; } });
  }

  /* ================= Projet : compléments ================= */
  function complementsProjet(p) {
    const parts = S.participations.filter(x => x.projet_id === p.id);
    const achats = S.achats.filter(a => a.projet_id === p.id);
    return `
      ${blocBudget(p)}
      ${bloc('Parties prenantes', parts.length, parts.length ? `<ul class="lignes">${parts.map(x => { const pe = parId(S.personnes, x.personne_id); return `<li class="ligne" style="grid-template-columns:minmax(0,1fr)"><div><div class="titre">${esc(pe?.nom)}</div><div class="meta">${x.roles.map(r => pastille(r)).join('')}${x.mandat ? `<span>${esc(x.mandat)}</span>` : ''}</div></div></li>`; }).join('')}</ul>` : vide('Aucune partie prenante.'), `<button class="btn discret" data-ajpart="${p.id}">Ajouter</button>`)}
      ${achats.length ? bloc('Achats', achats.length, `<ul class="lignes">${achats.map(ligneAchat).join('')}</ul>`) : ''}
      ${blocNotesLiees({ projet_id: p.id })}`;
  }
  function brancherProjet(v, p) {
    brancher(v, '[data-budget]', el => ficheBudget(parId(S.budget, el.dataset.budget)));
    v.querySelectorAll('[data-ajbudget]').forEach(b => b.onclick = () => { const ouv = v.querySelector('details.lot-budget[open]'); ficheBudget({ projet_id: p.id, statut: 'À chiffrer', lot: ouv?.dataset.lot || null }); });
    v.querySelectorAll('details.lot-budget').forEach(d => d.ontoggle = () => { const o = S.filtres.lotsOuverts || (S.filtres.lotsOuverts = new Set()); d.open ? o.add(d.dataset.lot) : o.delete(d.dataset.lot); });
    v.querySelectorAll('[data-reserve]').forEach(b => b.onclick = () => fiche({ titre: 'Réserve pour imprévus', table: 'projets', ligne: { id: p.id, reserve_pct: p.reserve_pct }, champs: [{ k: 'reserve_pct', l: 'Réserve (% du TTC)', t: 'number', req: true }] }));
    brancherNotesLiees(v, { projet_id: p.id, titre: p.titre, domaine_id: p.domaine_id });
    brancher(v, '[data-achat]', el => ficheAchat(parId(S.achats, el.dataset.achat)));
    v.querySelectorAll('[data-ajpart]').forEach(b => b.onclick = () => fiche({ titre: 'Partie prenante', table: 'participations', ligne: { projet_id: p.id, statut: 'Actif', roles: [] }, champs: [
      { k: 'projet_id', l: 'Projet', t: 'ref', o: () => S.projets, lib: 'titre', req: true },
      { k: 'personne_id', l: 'Personne', t: 'ref', o: () => S.personnes, req: true },
      { k: 'roles', l: 'Rôles', t: 'multi', o: ['Sponsor', 'Lead / chargé de projet', 'Responsable de volet', 'Équipe de réalisation', 'Client / bénéficiaire', 'Fournisseur / expert', 'Approbateur'] },
      { k: 'mandat', l: 'Mandat', t: 'textarea', rows: 2 },
    ] }));
  }

  return {
    synchroTheme,
    vues: { vehicules: vueVehicules, achats: vueAchats, abonnements: vueAbonnements, transports: vueTransports, bibliotheque: vueBibliotheque, carnet: vueCarnet, routines: vueRoutines, revue: vueRevue, organigramme: vueOrganigramme, plus: vuePlus },
    encartsAccueil, complementsProjet, brancherProjet, ficheAchat, ficheNote, ficheCahier, blocNotesLiees, brancherNotesLiees,
  };
}
