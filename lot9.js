// ORBITE · Lot 9
// 1. Onglets comme dans un navigateur (barre sous l’en-tête, Ctrl+clic ou clic du milieu pour ouvrir en arrière-plan).
// 2. Notes en pleine page, chacune dans son onglet, avec un éditeur visuel (gras, listes, cases, titres, séparateurs…).
//    Le contenu reste enregistré en texte Markdown dans notes.contenu : le registre des décisions, la création de tâches
//    « - [ ] » et la recherche continuent de fonctionner tels quels.
// 3. Parties prenantes : compagnies (= unités « Organisation » de l’organigramme), personnes et organigramme au même endroit.
//    Une compagnie a une fiche de contact (personne de nature « Organisation » reliée par compagnie_id) pour pouvoir lui
//    déléguer ou lui promettre des tâches : les deux sont créées et renommées ensemble.
// 4. Domaines de vie : déplacés dans Réglages.
export function installerLot9(c) {
  const { sb, S, esc, toast, parId, aujourdhui, jourDate, cleJour, fmtHeure, rafraichir, liste, ouvert, ico, MODULES, dialogue, opts } = c;
  const rendre = () => c.rendre();
  const bloc = (titre, nb, corps, actions = '', cls = '') =>
    `<section class="bloc ${cls}"><header><h2>${titre}${nb != null ? ` <span class="nb">${nb}</span>` : ''}</h2>${actions}</header>${corps}</section>`;
  const vide = m => `<div class="vide">${m}</div>`;
  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const norm = t => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  /* =====================================================================
     1. ONGLETS
     ===================================================================== */
  // Un onglet = { id, vue, filtres, projetId, noteId, defil }. Gardés sur l’appareil (localStorage « orbite-onglets »).
  const CLE_ONG = 'orbite-onglets';
  const ALIAS = { reperes: 'parties', organigramme: 'parties' }; // anciens modules regroupés
  let O = { liste: [], actif: null };
  const nouvelId = () => Math.random().toString(36).slice(2, 9);
  const actif = () => O.liste.find(t => t.id === O.actif);
  const propre = f => { try { return JSON.parse(JSON.stringify(f || {}, (k, v) => v instanceof Set ? undefined : v)); } catch { return {}; } };
  function sauver() {
    clearTimeout(sauver.t);
    sauver.t = setTimeout(() => { try { localStorage.setItem(CLE_ONG, JSON.stringify({ actif: O.actif, liste: O.liste.map(t => ({ ...t, filtres: propre(t.filtres) })) })); } catch { } }, 150);
  }
  function appliquer(t) {
    S.vue = ALIAS[t.vue] || t.vue || 'accueil'; S.filtres = t.filtres || {}; S.projetId = t.projetId || null; S.noteId = t.noteId || null; S.reorg = false;
    if (t.vue === 'organigramme') S.filtres.sous = 'organigramme';
  }
  // Appelé au début de chaque rendu : l’état affiché devient celui de l’onglet actif.
  function synchro() {
    if (ALIAS[S.vue]) { if (S.vue === 'organigramme') S.filtres = { ...S.filtres, sous: 'organigramme' }; S.vue = ALIAS[S.vue]; }
    if (S.vue !== 'note') S.noteId = null;
    const t = actif(); if (!t) return;
    Object.assign(t, { vue: S.vue, filtres: S.filtres, projetId: S.projetId || null, noteId: S.noteId || null });
    sauver();
  }
  function restaurer(hash) {
    try { const o = JSON.parse(localStorage.getItem(CLE_ONG) || 'null'); if (o?.liste?.length) O = o; } catch { }
    if (!O.liste.find(t => t.id === O.actif)) O.actif = O.liste[0]?.id;
    if (!O.liste.length) { const t = { id: nouvelId(), vue: 'accueil', filtres: {} }; O = { liste: [t], actif: t.id }; }
    appliquer(actif());
    // Lien direct (notification #revue…) : ouvert dans l’onglet actif.
    const k = ALIAS[hash] || hash;
    if (k && (MODULES.some(m => m.k === k))) { S.vue = k; S.filtres = hash === 'organigramme' ? { sous: 'organigramme' } : {}; }
  }
  function titreOnglet(t) {
    if (t.vue === 'projet') return parId(S.projets, t.projetId)?.titre || 'Projet';
    if (t.vue === 'note') return (brouillons[t.noteId]?.titre || parId(S.notes, t.noteId)?.titre || '').trim() || 'Nouvelle note';
    if (t.vue === 'plus') return 'Plus';
    return MODULES.find(m => m.k === (ALIAS[t.vue] || t.vue))?.l || 'Accueil';
  }
  const icoOnglet = t => t.vue === 'note' ? ico('carnet') : t.vue === 'projet' ? ico('projets') : MODULES.some(m => m.k === t.vue) ? ico(t.vue) : ico('accueil');
  function barreOnglets() {
    return `<div class="barre-onglets" role="tablist" aria-label="Onglets ouverts">
      ${O.liste.map(t => { const ti = titreOnglet(t), a = t.id === O.actif;
        return `<div class="onglet${a ? ' actif' : ''}" role="tab" aria-selected="${a}" tabindex="${a ? 0 : -1}" data-onglet="${t.id}" title="${esc(ti)}">${icoOnglet(t)}<span>${esc(ti)}</span>
          <button type="button" class="fermer-onglet" data-fermer-onglet="${t.id}" aria-label="Fermer l’onglet ${esc(ti)}" title="Fermer">×</button></div>`; }).join('')}
      <button type="button" class="nouvel-onglet" data-nouvel-onglet aria-label="Nouvel onglet" title="Nouvel onglet">+</button></div>`;
  }
  function majBarre() {
    const b = document.querySelector('.barre-onglets'); if (!b) return;
    const g = b.scrollLeft; b.outerHTML = barreOnglets();
    const n = document.querySelector('.barre-onglets'); n.scrollLeft = g; brancherOnglets(document);
  }
  function brancherOnglets(racine) {
    const b = racine.querySelector('.barre-onglets'); if (!b) return;
    b.querySelectorAll('[data-onglet]').forEach(el => {
      el.onclick = e => { if (e.target.closest('[data-fermer-onglet]')) return; if (el.dataset.onglet !== O.actif) activer(el.dataset.onglet); };
      el.onauxclick = e => { if (e.button === 1) { e.preventDefault(); fermer(el.dataset.onglet); } };
      el.onmousedown = e => { if (e.button === 1) e.preventDefault(); };
      el.onkeydown = e => {
        const i = O.liste.findIndex(t => t.id === el.dataset.onglet);
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const s = O.liste[(i + (e.key === 'ArrowRight' ? 1 : -1) + O.liste.length) % O.liste.length]; activer(s.id); requestAnimationFrame(() => document.querySelector(`[data-onglet="${s.id}"]`)?.focus()); }
        if (e.key === 'Delete') fermer(el.dataset.onglet);
      };
    });
    b.querySelectorAll('[data-fermer-onglet]').forEach(x => x.onclick = e => { e.stopPropagation(); fermer(x.dataset.fermerOnglet); });
    b.querySelector('[data-nouvel-onglet]').onclick = () => ouvrir({ vue: 'accueil' });
    hauteurTete();
    // L’onglet actif reste visible dans la bande qui défile.
    const a = b.querySelector('.onglet.actif'); if (a && (a.offsetLeft < b.scrollLeft || a.offsetLeft + a.offsetWidth > b.scrollLeft + b.clientWidth)) b.scrollLeft = a.offsetLeft - 20;
  }
  function activer(id) {
    const avant = actif();
    if (avant) { avantRendre(); synchro(); avant.defil = window.scrollY; }
    O.actif = id; const t = actif(); appliquer(t);
    history.replaceState(null, '', S.vue === 'accueil' ? location.pathname : '#' + S.vue);
    rendre(); sauver();
    requestAnimationFrame(() => window.scrollTo(0, t.defil || 0));
  }
  function ouvrir(etat, { arrierePlan = false } = {}) {
    synchro();
    const t = { id: nouvelId(), vue: 'accueil', filtres: {}, projetId: null, noteId: null, ...etat };
    const i = O.liste.findIndex(x => x.id === O.actif);
    O.liste.splice(i + 1, 0, t);
    if (arrierePlan) { sauver(); majBarre(); toast(`« ${titreOnglet(t)} » ouvert dans un nouvel onglet`); } else activer(t.id);
    return t;
  }
  function fermer(id) {
    const t = O.liste.find(x => x.id === id); if (!t) return;
    if (id === O.actif) avantRendre();
    if (O.liste.length === 1) { Object.assign(t, { vue: 'accueil', filtres: {}, projetId: null, noteId: null, defil: 0 }); appliquer(t); history.replaceState(null, '', location.pathname); rendre(); sauver(); return; }
    const i = O.liste.indexOf(t); O.liste.splice(i, 1);
    if (id === O.actif) { O.actif = null; const s = O.liste[Math.min(i, O.liste.length - 1)]; O.actif = s.id; appliquer(s); history.replaceState(null, '', S.vue === 'accueil' ? location.pathname : '#' + S.vue); rendre(); requestAnimationFrame(() => window.scrollTo(0, s.defil || 0)); }
    else majBarre();
    sauver();
  }
  // Hauteur réelle de l’en-tête (avec la bande d’onglets) : sert au menu latéral et à la barre d’outils des notes, collants.
  function hauteurTete() { const h = document.querySelector('.bandeau'); if (h) document.documentElement.style.setProperty('--haut-tete', h.offsetHeight + 'px'); }
  window.addEventListener('resize', hauteurTete);
  // Ctrl+clic, Cmd+clic ou clic du milieu sur un lien interne : ouvert dans un nouvel onglet, en arrière-plan.
  function cibleLien(el) {
    const v = el.closest('[data-vue], [data-projet], [data-note], [data-aller]'); if (!v || v.closest('.barre-onglets')) return null;
    if (v.dataset.projet) return { vue: 'projet', projetId: v.dataset.projet };
    if (v.dataset.note) return { note: v.dataset.note };
    const k = v.dataset.vue || v.dataset.aller;
    return k && (MODULES.some(m => m.k === k) || k === 'plus') ? { vue: k } : null;
  }
  function interception(e) {
    if (!S.session || !(e.ctrlKey || e.metaKey || e.button === 1)) return;
    const cible = cibleLien(e.target); if (!cible) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (cible.note) ouvrirNote(parId(S.notes, cible.note), { arrierePlan: true }); else ouvrir(cible, { arrierePlan: true });
  }
  document.addEventListener('click', interception, true);
  document.addEventListener('auxclick', interception, true);
  document.addEventListener('mousedown', e => { if (e.button === 1 && S.session && cibleLien(e.target)) e.preventDefault(); }, true);

  /* =====================================================================
     2. NOTES : texte Markdown ⇄ éditeur visuel
     ===================================================================== */
  // Format retenu (une ligne = un bloc) : « # », « ## », « ### » titres; « - », « * » puces; « 1. » numéros;
  // « - [ ] », « - [x] », « - [→] » cases (→ = déjà transformée en tâche); « > » citation; « --- » séparateur;
  // **gras**, *italique*, ~~barré~~, `code`, [texte](https://lien). Indentation de 2 espaces par niveau de liste.
  function enLigne(t) {
    let s = esc(t);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  const RE_LI = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/;
  const RE_HR = /^\s*([-*_])(\s*\1){2,}\s*$/;
  function mdVersHtml(md) {
    const L = (md || '').replace(/\r/g, '').split('\n');
    let h = '', i = 0;
    while (i < L.length) {
      const l = L[i];
      if (RE_HR.test(l)) { h += '<hr>'; i++; continue; }
      const t = l.match(/^(#{1,3})\s+(.*)$/);
      if (t) { const n = t[1].length + 1; h += `<h${n}>${enLigne(t[2]) || '<br>'}</h${n}>`; i++; continue; }
      if (/^\s*>\s?/.test(l)) {
        let q = '';
        while (i < L.length && /^\s*>\s?/.test(L[i])) { const x = L[i].replace(/^\s*>\s?/, ''); q += `<p>${enLigne(x) || '<br>'}</p>`; i++; }
        h += `<blockquote>${q}</blockquote>`; continue;
      }
      if (RE_LI.test(l)) {
        const items = [];
        while (i < L.length && RE_LI.test(L[i])) { const m = L[i].match(RE_LI); items.push({ niv: Math.floor(m[1].replace(/\t/g, '  ').length / 2), ord: /\d/.test(m[2]), txt: m[3] }); i++; }
        h += construireListe(items); continue;
      }
      h += `<p>${enLigne(l) || '<br>'}</p>`; i++;
    }
    return h || '<p><br></p>';
  }
  function construireListe(items) {
    let h = ''; const pile = [];
    items.forEach(it => {
      const tag = it.ord ? 'ol' : 'ul';
      const cas = it.txt.match(/^\[( |x|X|→)\]\s?(.*)$/);
      let niv = it.niv; const haut = pile[pile.length - 1];
      if (haut && niv > haut.niv + 1) niv = haut.niv + 1;
      while (pile.length && pile[pile.length - 1].niv > niv) h += `</li></${pile.pop().tag}>`;
      const sommet = pile[pile.length - 1];
      if (!sommet || sommet.niv < niv) { h += `<${tag}>`; pile.push({ niv, tag }); }
      else if (sommet.tag !== tag) { h += `</li></${sommet.tag}><${tag}>`; sommet.tag = tag; }
      else h += '</li>';
      h += cas ? `<li data-case="${cas[1] === '→' ? '→' : cas[1].trim() ? 'x' : ' '}">${enLigne(cas[2]) || '<br>'}` : `<li>${enLigne(it.txt) || '<br>'}`;
    });
    while (pile.length) h += `</li></${pile.pop().tag}>`;
    return h;
  }
  const BLOCS = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'HR', 'BLOCKQUOTE', 'PRE', 'TABLE'];
  function enrober(x, m) { const r = x.match(/^(\s*)([\s\S]*?)(\s*)$/); return r[2] ? `${r[1]}${m}${r[2]}${m}${r[3]}` : x; }
  function enLigneMd(noeud) {
    let s = '';
    noeud.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { s += ch.nodeValue.replace(/\u00a0/g, ' ').replace(/\n/g, ' '); return; }
      if (ch.nodeType !== 1) return;
      const t = ch.tagName;
      if (t === 'UL' || t === 'OL') return; // listes imbriquées : traitées à part
      if (t === 'BR') { s += '\n'; return; }
      const x = enLigneMd(ch);
      const gras = t === 'STRONG' || t === 'B' || (t === 'SPAN' && /bold|[6-9]00/.test(ch.style.fontWeight));
      const ital = t === 'EM' || t === 'I' || (t === 'SPAN' && ch.style.fontStyle === 'italic');
      if (gras) s += enrober(x, '**');
      else if (ital) s += enrober(x, '*');
      else if (t === 'S' || t === 'STRIKE' || t === 'DEL') s += enrober(x, '~~');
      else if (t === 'CODE') s += x ? '`' + x + '`' : '';
      else if (t === 'A') { const href = ch.getAttribute('href') || ''; s += /^https?:/.test(href) && href !== x ? `[${x}](${href})` : x; }
      else s += x;
    });
    return s;
  }
  function listeMd(liste, niv, out) {
    let n = 1; const ord = liste.tagName === 'OL';
    liste.childNodes.forEach(li => {
      if (li.nodeType !== 1) return;
      if (li.tagName === 'UL' || li.tagName === 'OL') { listeMd(li, niv + 1, out); return; }
      if (li.tagName !== 'LI') { const x = enLigneMd(li).trim(); if (x) out.push('  '.repeat(niv) + '- ' + x); return; }
      const txt = enLigneMd(li).replace(/\n+/g, ' ').trim();
      const cas = li.dataset.case != null ? `[${li.dataset.case || ' '}] ` : '';
      out.push('  '.repeat(niv) + (ord ? `${n++}. ` : '- ') + cas + txt);
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(s => listeMd(s, niv + 1, out));
    });
  }
  function blocsMd(racine, out) {
    racine.childNodes.forEach(ch => {
      if (ch.nodeType === 3) { const t = ch.nodeValue.replace(/\u00a0/g, ' '); if (t.trim()) out.push(t.trim()); return; }
      if (ch.nodeType !== 1) return;
      const t = ch.tagName;
      if (t === 'HR') out.push('---');
      else if (/^H[1-6]$/.test(t)) out.push('#'.repeat(Math.max(1, Math.min(3, +t[1] - 1))) + ' ' + enLigneMd(ch).replace(/\n/g, ' ').trim());
      else if (t === 'UL' || t === 'OL') listeMd(ch, 0, out);
      else if (t === 'BLOCKQUOTE') { const s = []; blocsMd(ch, s); (s.length ? s : ['']).forEach(l => out.push('> ' + l)); }
      else if ([...ch.children].some(x => BLOCS.includes(x.tagName))) blocsMd(ch, out);
      else if (t === 'P' || t === 'DIV' || t === 'PRE') { const x = enLigneMd(ch).replace(/\n$/, ''); x.split('\n').forEach(l => out.push(l.replace(/\s+$/, ''))); }
      else { const x = enLigneMd({ childNodes: [ch] }); if (x.trim()) out.push(x); }
    });
    return out;
  }
  function htmlVersMd(racine) {
    const l = blocsMd(racine, []);
    while (l.length && !l[l.length - 1].trim()) l.pop();
    return l.join('\n');
  }
  // Texte sans balises, pour les extraits dans les listes.
  const texteBrut = md => (md || '').replace(/^\s*>\s?/gm, '').replace(/^#{1,3}\s+/gm, '').replace(/^\s*([-*•+]|\d+[.)])\s+(\[[ x→]\]\s?)?/gm, '• ')
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '').replace(/\*\*|~~|`/g, '').replace(/(^|[^*])\*([^*]+)\*/g, '$1$2').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  /* ---------- Page d’une note ---------- */
  const TYPES_NOTE = ['Note', 'Idée', 'Compte rendu', 'Décision', 'Référence', 'Bilan'];
  const MOTS = ['À explorer', 'Important', 'Réutilisable'];
  const brouillons = {}; // id (ou « nouvelle-… ») → dernière version saisie, en attente d’enregistrement
  let page = null;       // { id, ver, enregistre, timer, enCours, encore }
  function ouvrirNote(n, { arrierePlan = false } = {}) {
    if (n?.id) {
      const ex = O.liste.find(t => t.vue === 'note' && t.noteId === n.id);
      if (ex) { if (!arrierePlan) activer(ex.id); return; }
      return ouvrir({ vue: 'note', noteId: n.id }, { arrierePlan });
    }
    const tmp = 'nouvelle-' + nouvelId();
    brouillons[tmp] = { titre: '', contenu: '', type: 'Note', date: aujourdhui(), mots_cles: [], archivee: false, ...(n || {}) };
    return ouvrir({ vue: 'note', noteId: tmp }, { arrierePlan });
  }
  const estNouvelle = id => !id || String(id).startsWith('nouvelle-');
  const actionsLiables = courant => S.actions.filter(a => a.id === courant || (ouvert(a) && a.type !== 'Routine')).sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));

  const OUTILS = [
    ['bold', '<b>G</b>', 'Gras (Ctrl+B)'], ['italic', '<i>I</i>', 'Italique (Ctrl+I)'], ['strikeThrough', '<s>B</s>', 'Barré'], ['|'],
    ['h2', 'T1', 'Titre'], ['h3', 'T2', 'Sous-titre'], ['p', '¶', 'Texte normal (retire titres et mise en forme)'], ['|'],
    ['insertUnorderedList', '<svg viewBox="0 0 24 24"><circle cx="5" cy="7" r="1.6" fill="currentColor"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="5" cy="17" r="1.6" fill="currentColor"/><path d="M9 7h11M9 12h11M9 17h11" stroke="currentColor" stroke-width="2"/></svg>', 'Liste à puces (ou tape « - » puis espace)'],
    ['insertOrderedList', '<svg viewBox="0 0 24 24"><text x="2" y="9" font-size="7" font-family="monospace" fill="currentColor">1.</text><text x="2" y="19" font-size="7" font-family="monospace" fill="currentColor">2.</text><path d="M10 7h10M10 17h10" stroke="currentColor" stroke-width="2"/></svg>', 'Liste numérotée (ou « 1. » puis espace)'],
    ['cases', '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="7" height="7" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m4.5 7.5 1.6 1.6 3-3.2M13 7.5h8M3 14h7v7H3zM13 17.5h8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>', 'Cases à cocher (ou « [] » puis espace). Une case « - [ ] » peut devenir une tâche.'],
    ['outdent', '⇤', 'Remonter d’un niveau (Maj+Tab)'], ['indent', '⇥', 'Descendre d’un niveau (Tab)'], ['|'],
    ['blockquote', '❝', 'Citation (ou « > » puis espace)'], ['hr', '—', 'Séparateur (ou « --- » puis Entrée)'], ['lien', '🔗', 'Lien'],
  ];
  function vueNote(v) {
    const id = S.noteId;
    const base = estNouvelle(id) ? {} : parId(S.notes, id);
    if (!estNouvelle(id) && !base) {
      v.innerHTML = bloc('Note introuvable', null, vide('Cette note a été supprimée ou n’est pas encore chargée.'), '<button class="btn" data-vue-carnet>Carnet</button>');
      v.querySelector('[data-vue-carnet]').onclick = () => { S.vue = 'carnet'; rendre(); };
      return;
    }
    const n = { titre: '', contenu: '', type: 'Note', date: aujourdhui(), mots_cles: [], ...base, ...(brouillons[id] || {}) };
    page = { id, ver: 0, enregistre: 0, timer: null, enCours: null, encore: false };
    const evt = n.action_id && parId(S.actions, n.action_id);
    const issues = !estNouvelle(id) ? S.actions.filter(a => a.note_id === id).length : 0;
    const p = parId(S.projets, n.projet_id);
    const resume = [n.type, n.date ? jourDate(n.date) : '', p?.titre, parId(S.cahiers || [], n.cahier_id)?.titre].filter(Boolean).map(esc).join(' · ');
    v.innerHTML = `<article class="page-note">
      <div class="barre-note">
        <button type="button" class="btn discret" data-retour-carnet>← Carnet</button>
        <span class="etat-note" aria-live="polite">${estNouvelle(id) ? 'Nouvelle note · s’enregistre dès que tu écris' : 'Enregistrée'}</span>
        <div class="boutons-entete">
          ${evt && evt.type === 'Événement' ? `<button type="button" class="btn discret" data-ouvrir-evt>Événement</button>` : ''}
          <button type="button" class="btn" data-creer-taches title="Chaque case « - [ ] » devient une tâche">Créer les tâches${issues ? ` · ${issues} déjà` : ''}</button>
          ${estNouvelle(id) ? '' : '<button type="button" class="btn danger" data-suppr-note>Supprimer</button>'}
        </div>
      </div>
      <input class="titre-note" name="titre" value="${esc(n.titre)}" placeholder="Titre de la note" aria-label="Titre de la note" autocomplete="off">
      <details class="proprietes-note"${estNouvelle(id) && (n.projet_id || n.action_id) ? '' : ''}><summary>${resume || 'Propriétés'}<span class="aide"> · type, date, cahier, projet, domaine, tâche liée</span></summary>
        <div class="grille-proprietes">
          <label class="champ"><span>Type</span><select name="type">${TYPES_NOTE.map(t => `<option ${t === n.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="champ"><span>Date</span><input type="date" name="date" value="${esc(n.date || '')}"></label>
          <label class="champ"><span>Cahier</span><select name="cahier_id">${opts((S.cahiers || []).filter(x => !x.archive || x.id === n.cahier_id).sort((a, b) => a.titre.localeCompare(b.titre, 'fr')), n.cahier_id, { lib: 'titre' })}</select></label>
          <label class="champ"><span>Projet</span><select name="projet_id">${opts(S.projets.slice().sort((a, b) => a.titre.localeCompare(b.titre, 'fr')), n.projet_id, { lib: 'titre' })}</select></label>
          <label class="champ"><span>Domaine</span><select name="domaine_id">${opts(S.domaines, n.domaine_id)}</select></label>
          <label class="champ"><span>Tâche ou événement lié</span><select name="action_id">${opts(actionsLiables(n.action_id), n.action_id, { lib: 'titre' })}</select></label>
          <div class="champ large"><span>Mots-clés</span><div class="types-rapides">${MOTS.map(m => `<label><input type="checkbox" name="mots_cles" value="${m}" ${(n.mots_cles || []).includes(m) ? 'checked' : ''}><span>${m}</span></label>`).join('')}
            <label><input type="checkbox" name="archivee" ${n.archivee ? 'checked' : ''}><span>Archivée</span></label></div></div>
        </div></details>
      <div class="outils-edition" role="toolbar" aria-label="Mise en forme">${OUTILS.map(([k, l, t]) => k === '|' ? '<span class="sep-outils" aria-hidden="true"></span>' : `<button type="button" data-cmd="${k}" title="${esc(t)}" aria-label="${esc(t)}">${l}</button>`).join('')}</div>
      <div class="editeur-note" contenteditable="true" spellcheck="true" lang="fr-CA" role="textbox" aria-multiline="true" aria-label="Contenu de la note">${mdVersHtml(n.contenu)}</div>
    </article>`;
    brancherNote(v);
  }
  const lireChamp = (v, k) => v.querySelector(`[name="${k}"]`);
  function lireNote(v) {
    const val = k => lireChamp(v, k)?.value || null;
    return { titre: lireChamp(v, 'titre').value, contenu: htmlVersMd(v.querySelector('.editeur-note')), type: val('type') || 'Note', date: val('date'),
      cahier_id: val('cahier_id'), projet_id: val('projet_id'), domaine_id: val('domaine_id'), action_id: val('action_id'),
      mots_cles: [...v.querySelectorAll('[name=mots_cles]:checked')].map(x => x.value), archivee: !!lireChamp(v, 'archivee')?.checked };
  }
  function etat(txt, erreur = false) { const e = document.querySelector('.page-note .etat-note'); if (e) { e.textContent = txt; e.classList.toggle('erreur', erreur); } }
  // Chaque modification : copie dans brouillons (survit à un nouveau rendu), puis enregistrement 0,8 s après la dernière frappe.
  function modifie(v) {
    if (!page) return;
    brouillons[page.id] = lireNote(v); page.ver++;
    etat('Modifications…');
    clearTimeout(page.timer); page.timer = setTimeout(lancer, 800);
    if (O.liste.some(t => t.noteId === page.id)) majTitreOnglet();
  }
  function majTitreOnglet() {
    const t = O.liste.find(x => x.noteId === page?.id); const el = t && document.querySelector(`[data-onglet="${t.id}"] span`);
    if (el) el.textContent = titreOnglet(t);
  }
  function lancer() {
    if (!page) return;
    clearTimeout(page.timer); page.timer = null;
    const pg = page;
    if (pg.enCours) { pg.encore = true; return; }
    pg.enCours = enregistrer(pg).finally(() => { pg.enCours = null; if (pg.encore) { pg.encore = false; lancer.call(null, pg); } });
  }
  async function enregistrer(pg) {
    const val = brouillons[pg.id]; if (!val) return;
    const ver = pg.ver;
    const ligne = { ...val, titre: val.titre.trim() || 'Sans titre' };
    if (estNouvelle(pg.id)) {
      if (!val.titre.trim() && !val.contenu.trim()) return;
      etat('Enregistrement…');
      const { data, error } = await sb.from('notes').insert(ligne).select('*').single();
      if (error) { etat('Non enregistrée : ' + error.message, true); return; }
      S.notes.push(data);
      const tmp = pg.id; pg.id = data.id; brouillons[data.id] = brouillons[tmp]; delete brouillons[tmp];
      O.liste.forEach(t => { if (t.noteId === tmp) t.noteId = data.id; });
      if (S.noteId === tmp) S.noteId = data.id;
      sauver(); majBarre();
      const s = document.querySelector('[data-suppr-note]'); if (!s) document.querySelector('.page-note .barre-note .boutons-entete')?.insertAdjacentHTML('beforeend', '<button type="button" class="btn danger" data-suppr-note>Supprimer</button>'), brancherSuppression();
    } else {
      etat('Enregistrement…');
      const { error } = await sb.from('notes').update(ligne).eq('id', pg.id);
      if (error) { etat('Non enregistrée : ' + error.message, true); return; }
      const n = parId(S.notes, pg.id); if (n) Object.assign(n, ligne);
    }
    if (pg.ver === ver) delete brouillons[pg.id];
    if (page === pg) etat(`Enregistrée à ${fmtHeure.format(new Date())}`);
  }
  // Avant tout nouveau rendu (changement d’onglet, de module…) : on enregistre ce qui attend.
  function avantRendre() { if (page?.timer) lancer(); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) avantRendre(); });
  window.addEventListener('pagehide', avantRendre);
  const editionEnCours = () => S.vue === 'note' && !!document.activeElement?.closest?.('.page-note');

  function blocCourant(ed) {
    const sel = getSelection(); if (!sel.rangeCount) return null;
    let n = sel.anchorNode; n = n?.nodeType === 3 ? n.parentElement : n;
    const b = n?.closest?.('li, p, div, h1, h2, h3, h4, blockquote');
    return b && b !== ed && ed.contains(b) ? b : null;
  }
  const texteAvantCurseur = b => { const sel = getSelection(); const r = document.createRange(); r.setStart(b, 0); r.setEnd(sel.anchorNode, sel.anchorOffset); return r.toString().replace(/\u00a0/g, ' '); };
  function viderDebut(b, nb) {
    const sel = getSelection(), r = document.createRange();
    r.setStart(b, 0); r.setEnd(sel.anchorNode, sel.anchorOffset);
    if (r.toString().length === nb) r.deleteContents();
    if (!b.textContent && !b.querySelector('br')) b.innerHTML = '<br>';
    const c2 = document.createRange(); c2.setStart(b, 0); c2.collapse(true); sel.removeAllRanges(); sel.addRange(c2);
  }
  function commande(ed, cmd, v) {
    ed.focus();
    const b = blocCourant(ed);
    const bascule = tag => document.execCommand('formatBlock', false, b?.closest(tag) ? 'p' : tag);
    if (cmd === 'h2' || cmd === 'h3') bascule(cmd);
    else if (cmd === 'blockquote') bascule('blockquote');
    else if (cmd === 'p') { document.execCommand('formatBlock', false, 'p'); document.execCommand('removeFormat'); }
    else if (cmd === 'hr') { document.execCommand('insertHorizontalRule'); const hr = [...ed.querySelectorAll('hr')].find(h => !h.nextElementSibling); if (hr) hr.insertAdjacentHTML('afterend', '<p><br></p>'); }
    else if (cmd === 'lien') {
      const sel = getSelection(), txt = sel.toString();
      const url = prompt('Adresse du lien (https://…)', /^https?:\/\//.test(txt) ? txt : 'https://'); if (!url || !/^https?:\/\/\S+/.test(url)) return;
      if (txt) document.execCommand('createLink', false, url); else document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
    } else if (cmd === 'cases') {
      let li = b?.closest('li');
      if (li && li.dataset.case != null) { delete li.dataset.case; }
      else { if (!li || li.parentElement.tagName !== 'UL') document.execCommand('insertUnorderedList'); li = blocCourant(ed)?.closest('li'); if (li) li.dataset.case = ' '; }
    } else document.execCommand(cmd, false, v ?? null);
    majOutils(ed);
  }
  function majOutils(ed) {
    const b = blocCourant(ed);
    document.querySelectorAll('.outils-edition [data-cmd]').forEach(x => {
      const k = x.dataset.cmd; let on = false;
      try { if (['bold', 'italic', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(k)) on = document.queryCommandState(k); } catch { }
      if (k === 'h2' || k === 'h3' || k === 'blockquote') on = !!b?.closest(k);
      if (k === 'cases') on = b?.closest('li')?.dataset.case != null;
      if (k === 'insertUnorderedList' && b?.closest('li')?.dataset.case != null) on = false;
      x.setAttribute('aria-pressed', String(on));
    });
  }
  function brancherSuppression() {
    const s = document.querySelector('[data-suppr-note]'); if (!s) return;
    s.onclick = async () => {
      if (s.dataset.ok !== '1') { s.dataset.ok = '1'; s.textContent = 'Confirmer la suppression'; return; }
      const id = page.id; clearTimeout(page.timer); page = null; delete brouillons[id];
      const { error } = await sb.from('notes').delete().eq('id', id);
      if (error) return toast('Échec : ' + error.message);
      S.notes = S.notes.filter(n => n.id !== id); toast('Note supprimée');
      const t = O.liste.find(x => x.noteId === id); if (t) { t.vue = 'carnet'; t.noteId = null; }
      S.vue = 'carnet'; S.noteId = null; rendre();
    };
  }
  function brancherNote(v) {
    const ed = v.querySelector('.editeur-note');
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch { }
    v.querySelector('[data-retour-carnet]').onclick = () => { avantRendre(); S.vue = 'carnet'; S.noteId = null; rendre(); window.scrollTo(0, 0); };
    v.querySelectorAll('input, select').forEach(x => { x.addEventListener('input', () => modifie(v)); x.addEventListener('change', () => modifie(v)); });
    ed.addEventListener('input', () => {
      // Une nouvelle case créée par Entrée hérite de « cochée » : on la remet vide.
      ed.querySelectorAll('li[data-case="x"], li[data-case="→"]').forEach(li => { if (!li.textContent.trim()) li.dataset.case = ' '; });
      modifie(v);
    });
    // Barre d’outils : le toucher ne retire pas la sélection du texte.
    v.querySelectorAll('.outils-edition [data-cmd]').forEach(b => {
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.onclick = () => { commande(ed, b.dataset.cmd); modifie(v); };
    });
    document.addEventListener('selectionchange', function f() { if (!ed.isConnected) return document.removeEventListener('selectionchange', f); if (ed.contains(getSelection().anchorNode)) majOutils(ed); });
    // Cocher une case : toucher le carré à gauche.
    ed.addEventListener('click', e => {
      const li = e.target.closest?.('li[data-case]');
      if (li && e.target === li && e.offsetX < 26) { e.preventDefault(); li.dataset.case = li.dataset.case === ' ' ? 'x' : ' '; modifie(v); }
      const a = e.target.closest?.('a[href]'); if (a && (e.ctrlKey || e.metaKey)) window.open(a.href, '_blank', 'noopener');
    });
    // Raccourcis d’écriture : « - » ou « * » + espace = puces, « 1. » = numéros, « [] » = case, « # » = titre, « > » = citation,
    // « --- » + Entrée = séparateur; Tab / Maj+Tab dans une liste = niveau.
    ed.addEventListener('keydown', e => {
      if (e.key === 'Tab' && blocCourant(ed)?.closest('li')) { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent'); modifie(v); return; }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      const sel = getSelection(); if (!sel.isCollapsed) return;
      const b = blocCourant(ed); if (!b || b.closest('li')) return;
      const avant = texteAvantCurseur(b);
      if (e.key === 'Enter') {
        if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(b.textContent) && avant.trim() === b.textContent.trim()) {
          e.preventDefault(); const p = document.createElement('p'); p.innerHTML = '<br>'; const hr = document.createElement('hr');
          b.replaceWith(hr); hr.after(p); const r = document.createRange(); r.setStart(p, 0); r.collapse(true); sel.removeAllRanges(); sel.addRange(r); modifie(v);
        }
        return;
      }
      const regles = [[/^[-*•]$/, 'insertUnorderedList'], [/^1[.)]$/, 'insertOrderedList'], [/^\[ ?\]$/, 'cases'], [/^#$/, 'h2'], [/^##$/, 'h3'], [/^>$/, 'blockquote']];
      const r = regles.find(([re]) => re.test(avant)); if (!r) return;
      e.preventDefault(); viderDebut(b, avant.length); commande(ed, r[1]); modifie(v);
    });
    // Coller : on garde la structure (titres, listes, gras) et on retire le reste (polices, couleurs…).
    ed.addEventListener('paste', e => {
      const html = e.clipboardData.getData('text/html'), txt = e.clipboardData.getData('text/plain');
      e.preventDefault();
      let md = txt;
      if (html) { const tmp = document.createElement('div'); tmp.innerHTML = html.replace(/<!--[\s\S]*?-->/g, ''); tmp.querySelectorAll('style, script, meta, title').forEach(x => x.remove()); md = htmlVersMd(tmp); }
      const frag = mdVersHtml(md);
      if (!md.includes('\n') && !/^\s*([-*•]|\d+[.)]|#|>)\s/.test(md)) document.execCommand('insertText', false, txt || md);
      else document.execCommand('insertHTML', false, frag);
      modifie(v);
    });
    v.querySelector('[data-creer-taches]').onclick = async e => {
      const b = e.currentTarget; b.disabled = true;
      try {
        brouillons[page.id] = lireNote(v); page.ver++;
        if (estNouvelle(page.id)) { if (!brouillons[page.id].titre.trim()) { lireChamp(v, 'titre').value = 'Sans titre'; brouillons[page.id].titre = 'Sans titre'; } await enregistrer(page); }
        if (estNouvelle(page.id)) return;
        const n = { ...parId(S.notes, page.id), ...brouillons[page.id], id: page.id };
        const nouveau = await c.creerActionsDepuisNote(n, n.contenu);
        if (nouveau != null) { ed.innerHTML = mdVersHtml(nouveau); brouillons[page.id] = lireNote(v); const x = parId(S.notes, page.id); if (x) x.contenu = nouveau; delete brouillons[page.id]; await c.rechargerActions(); etat('Tâches créées'); }
      } finally { b.disabled = false; }
    };
    const ev = v.querySelector('[data-ouvrir-evt]'); if (ev) ev.onclick = () => c.ouvrirAction(parId(S.actions, lireChamp(v, 'action_id').value));
    brancherSuppression();
    // Note neuve et vide : le curseur va au titre; sinon à la fin du texte.
    if (estNouvelle(page.id) && !lireChamp(v, 'titre').value) lireChamp(v, 'titre').focus();
  }

  /* =====================================================================
     3. PARTIES PRENANTES (compagnies, personnes, organigramme)
     ===================================================================== */
  const compagnies = (avecInactives = false) => S.unites.filter(u => u.categorie === 'Organisation' && (avecInactives || u.actif !== false)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const sousUnites = id => { const r = new Set([id]); let plus = true; while (plus) { plus = false; S.unites.forEach(u => { if (u.parent_id && r.has(u.parent_id) && !r.has(u.id)) { r.add(u.id); plus = true; } }); } return r; };
  const compagnieDe = idUnite => { let u = parId(S.unites, idUnite), g = 0; while (u && u.categorie !== 'Organisation' && u.parent_id && g++ < 20) u = parId(S.unites, u.parent_id); return u?.categorie === 'Organisation' ? u : null; };
  const contactDe = u => S.personnes.find(p => p.nature === 'Organisation' && p.compagnie_id === u.id);
  // Compagnie d’une personne : sa compagnie, sinon celle de son département.
  const compagniePersonne = p => parId(S.unites, p.compagnie_id) || (p.departement_id ? compagnieDe(p.departement_id) : null);
  const membres = u => { const un = sousUnites(u.id); return S.personnes.filter(p => p.nature !== 'Organisation' && (p.compagnie_id === u.id || (p.departement_id && un.has(p.departement_id)))); };
  // Organisations saisies comme « personnes » sans compagnie correspondante : à convertir.
  // Poste d’une personne : son poste dans l’organigramme, sinon l’ancienne fonction saisie en texte.
  const posteDe = p => S.titulaires.filter(t => t.personne_id === p.id).map(t => parId(S.postes, t.poste_id)?.titre).filter(Boolean).join(', ') || p.fonction || '';
  const aConvertir = () => S.personnes.filter(p => p.nature === 'Organisation' && !p.compagnie_id);

  function vueParties(v) {
    const f = S.filtres; const sous = f.sous || 'compagnies';
    if (f.compagnieId && !parId(S.unites, f.compagnieId)) f.compagnieId = null;
    const tete = `<div class="entete-vue"><div><h1>Parties prenantes</h1><p class="sous-titre">Compagnies, personnes et organigramme : une compagnie n’existe qu’une fois, partout.</p></div></div>
      <div class="outils"><div class="onglets" role="tablist">${[['compagnies', 'Compagnies'], ['personnes', 'Personnes'], ['organigramme', 'Organigramme']].map(([k, l]) => `<button aria-pressed="${sous === k}" data-sous="${k}">${l}</button>`).join('')}</div></div>`;
    if (sous === 'organigramme') {
      v.innerHTML = tete + '<div class="sous-vue-org"></div>';
      c.vueOrganigramme(v.querySelector('.sous-vue-org'));
    } else if (sous === 'personnes') { v.innerHTML = tete + vuePersonnes(); brancherPersonnes(v); }
    else if (f.compagnieId) { v.innerHTML = tete + pageCompagnie(parId(S.unites, f.compagnieId)); brancherCompagnie(v); }
    else { v.innerHTML = tete + vueCompagnies(); brancherCompagnies(v); }
    v.querySelectorAll('[data-sous]').forEach(b => b.onclick = () => { S.filtres = { sous: b.dataset.sous }; rendre(); window.scrollTo(0, 0); });
  }

  function vueCompagnies() {
    const inact = !!S.filtres.inactives;
    const cies = compagnies(true).filter(u => inact || u.actif !== false);
    const conv = aConvertir();
    const carte = u => {
      const m = membres(u), ct = contactDe(u), un = sousUnites(u.id);
      const ids = new Set([...m.map(p => p.id), ct?.id].filter(Boolean));
      const projets = new Set(S.participations.filter(x => ids.has(x.personne_id)).map(x => x.projet_id));
      const deleg = S.actions.filter(a => ouvert(a) && (ids.has(a.delegue_a_id) || ids.has(a.en_attente_de_id))).length;
      const prom = S.actions.filter(a => ouvert(a) && ids.has(a.promis_a_id)).length;
      return `<div class="projet carte-cie${u.actif === false ? ' inactive' : ''}" data-cie="${u.id}" role="button" tabindex="0">
        <div class="tete"><span class="nom">${esc(u.nom)}</span>${u.code ? `<span class="pastille">${esc(u.code)}</span>` : ''}</div>
        ${u.mandat ? `<div class="prochaine">${esc(u.mandat)}</div>` : ''}
        <div class="chiffres"><span>${pluriel(m.length, 'personne')}</span><span>${pluriel(un.size - 1, 'département')}</span>${projets.size ? `<span>${pluriel(projets.size, 'projet')}</span>` : ''}${deleg ? `<span>Me doit ${deleg}</span>` : ''}${prom ? `<span class="promis">Je lui dois ${prom}</span>` : ''}${u.actif === false ? '<span>Inactive</span>' : ''}</div>
        ${ct?.courriel || ct?.telephone ? `<div class="chiffres">${ct.courriel ? `<span>${esc(ct.courriel)}</span>` : ''}${ct.telephone ? `<span>${esc(ct.telephone)}</span>` : ''}</div>` : ''}</div>`;
    };
    return `${conv.length ? `<div class="bloc signal conversion-cies"><header><h2>${pluriel(conv.length, 'organisation')} à convertir en compagnie${conv.length > 1 ? 's' : ''}</h2><button class="btn primaire" data-convertir>Convertir</button></header>
        <div class="reglage"><p>Ces fiches ont été créées comme « personnes » de nature Organisation, donc invisibles dans l’organigramme : ${conv.map(p => esc(p.nom)).join(', ')}.
        Convertir crée la compagnie correspondante (ou la relie à une compagnie du même nom) et garde la fiche comme contact de la compagnie : tâches déléguées, promesses et parties prenantes de projet restent intactes.</p></div></div>` : ''}
      <div class="outils"><label class="champ case"><input type="checkbox" id="cieInactives" ${inact ? 'checked' : ''}><span>Afficher les compagnies inactives</span></label><button class="btn primaire" data-nouvelle-cie>Nouvelle compagnie</button></div>
      <div class="cartes-projets">${cies.map(carte).join('') || `<div class="bloc">${vide('Aucune compagnie. « Nouvelle compagnie » en crée une, utilisable partout : personnes, organigramme, délégations.')}</div>`}</div>`;
  }
  function brancherCompagnies(v) {
    v.querySelectorAll('[data-cie]').forEach(el => { const go = () => { S.filtres.compagnieId = el.dataset.cie; rendre(); window.scrollTo(0, 0); }; el.onclick = go; el.onkeydown = e => { if (e.key === 'Enter') go(); }; });
    v.querySelector('[data-nouvelle-cie]').onclick = () => ficheCompagnie({ actif: true });
    v.querySelector('#cieInactives').onchange = e => { S.filtres.inactives = e.target.checked; rendre(); };
    const cv = v.querySelector('[data-convertir]'); if (cv) cv.onclick = () => convertir(cv);
  }
  async function convertir(btn) {
    btn.disabled = true; let n = 0;
    for (const p of aConvertir()) {
      let u = S.unites.find(x => x.categorie === 'Organisation' && norm(x.nom) === norm(p.nom));
      if (!u) {
        const { data, error } = await sb.from('unites').insert({ nom: p.nom, categorie: 'Organisation', actif: true }).select('*').single();
        if (error) { toast('Échec pour ' + p.nom + ' : ' + error.message); continue; }
        u = data; S.unites.push(u);
      }
      const { error } = await sb.from('personnes').update({ compagnie_id: u.id }).eq('id', p.id);
      if (error) { toast('Échec pour ' + p.nom + ' : ' + error.message); continue; }
      n++;
    }
    toast(`${pluriel(n, 'compagnie')} convertie${n > 1 ? 's' : ''}`); rafraichir();
  }

  function pageCompagnie(u) {
    const ct = contactDe(u), m = membres(u).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    const ids = new Set([...m.map(p => p.id), ct?.id].filter(Boolean));
    const parts = S.participations.filter(x => ids.has(x.personne_id));
    const parProjet = {}; parts.forEach(x => (parProjet[x.projet_id] ||= []).push(x));
    const meDoit = S.actions.filter(a => ouvert(a) && (ids.has(a.delegue_a_id) || ids.has(a.en_attente_de_id)));
    const jeDois = S.actions.filter(a => ouvert(a) && ids.has(a.promis_a_id));
    const arbre = (id, niv) => S.unites.filter(x => x.parent_id === id).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')).map(x => {
      const n = S.personnes.filter(p => p.departement_id === x.id).length;
      return `<li class="ligne" data-unite-cie="${x.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto;padding-left:${14 + niv * 18}px"><div><div class="titre">${esc(x.nom)}</div><div class="meta"><span>${esc(x.categorie)}</span>${x.code ? `<span>${esc(x.code)}</span>` : ''}</div></div><div class="droite">${n ? pluriel(n, 'personne') : ''}</div></li>` + arbre(x.id, niv + 1);
    }).join('');
    const deps = arbre(u.id, 0);
    return `<div class="fil-cie"><button class="btn discret" data-retour-cies>← Compagnies</button></div>
      <div class="entete-cie"><div><h2 class="nom-cie">${esc(u.nom)}${u.actif === false ? ' <span class="pastille">Inactive</span>' : ''}</h2>
        <p class="sous-titre">${[u.code, ct?.courriel, ct?.telephone].filter(Boolean).map(esc).join(' · ') || 'Aucune coordonnée'}${u.mandat ? '<br>' + esc(u.mandat) : ''}</p></div>
        <div class="boutons-entete"><button class="btn" data-org-cie>Organigramme</button><button class="btn primaire" data-modif-cie>Modifier</button></div></div>
      <div class="grille">
        <div class="colonne">
          ${bloc('Personnes', m.length, m.length ? `<ul class="lignes">${m.map(p => `<li class="ligne" data-pers-cie="${p.id}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="titre">${esc(p.nom)}</div><div class="meta">${[posteDe(p), parId(S.unites, p.departement_id)?.nom].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('')}</div></div><div class="droite">${esc(p.courriel || '')}</div></li>`).join('')}</ul>` : vide('Personne pour l’instant.'), '<button class="btn" data-aj-pers-cie>Ajouter</button>')}
          ${bloc('Départements et équipes', S.unites.filter(x => sousUnites(u.id).has(x.id)).length - 1, deps ? `<ul class="lignes">${deps}</ul>` : vide('Aucun département. Ils apparaissent aussi dans l’organigramme.'), '<button class="btn" data-aj-dep-cie>Ajouter</button>')}
        </div>
        <div class="colonne">
          ${bloc('Projets', Object.keys(parProjet).length, Object.keys(parProjet).length ? `<ul class="lignes">${Object.entries(parProjet).map(([pid, xs]) => { const p = parId(S.projets, pid); return p ? `<li class="ligne" data-projet="${pid}" role="button" tabindex="0" style="grid-template-columns:minmax(0,1fr)"><div><div class="titre">${esc(p.titre)}</div><div class="meta">${xs.map(x => `<span>${esc(parId(S.personnes, x.personne_id)?.nom || '')}${x.roles?.length ? ' · ' + esc(x.roles.join(', ')) : ''}</span>`).join('')}</div></div></li>` : ''; }).join('')}</ul>` : vide('Aucune partie prenante de cette compagnie dans un projet. Ajoute-la depuis la fiche d’un projet.'))}
          ${bloc('Ce qu’ils me doivent', meDoit.length, liste(meDoit, 'Rien de délégué ni en attente.'))}
          ${bloc('Ce que je leur dois', jeDois.length, liste(jeDois, 'Aucune promesse ouverte.'))}
        </div>
      </div>`;
  }
  function brancherCompagnie(v) {
    const u = parId(S.unites, S.filtres.compagnieId);
    v.querySelector('[data-retour-cies]').onclick = () => { S.filtres.compagnieId = null; rendre(); };
    v.querySelector('[data-modif-cie]').onclick = () => ficheCompagnie(u);
    v.querySelector('[data-org-cie]').onclick = () => { try { localStorage.setItem('orbite-org-unite', u.id); } catch { } S.filtres = { sous: 'organigramme', orgUnite: u.id }; rendre(); };
    v.querySelector('[data-aj-pers-cie]').onclick = () => c.ouvrirPersonne({ nature: 'Personne', actif: true, compagnie_id: u.id });
    v.querySelector('[data-aj-dep-cie]').onclick = () => c.ficheUnite({ categorie: 'Département', actif: true, parent_id: u.id });
    v.querySelectorAll('[data-pers-cie]').forEach(el => el.onclick = () => c.ouvrirPersonne(parId(S.personnes, el.dataset.persCie)));
    v.querySelectorAll('[data-unite-cie]').forEach(el => el.onclick = () => c.ficheUnite(parId(S.unites, el.dataset.uniteCie)));
  }
  // Fiche compagnie : l’unité « Organisation » et sa fiche de contact, enregistrées ensemble.
  function ficheCompagnie(u) {
    const nouveau = !u.id, ct = u.id ? contactDe(u) : null;
    dialogue(`<form><div class="tete-d"><h2>${nouveau ? 'Nouvelle compagnie' : esc(u.nom)}</h2><button type="button" class="btn discret" data-fermer aria-label="Fermer">✕</button></div>
      <div class="corps">
        <label class="champ large"><span>Nom</span><input name="nom" class="titre-saisie" required value="${esc(u.nom)}" ${nouveau ? 'autofocus' : ''}></label>
        <label class="champ"><span>Code (facultatif)</span><input name="code" value="${esc(u.code)}" placeholder="Ex. CD32, PURO"></label>
        <label class="champ case"><input type="checkbox" name="actif" ${u.actif !== false ? 'checked' : ''}><span>Active</span></label>
        <label class="champ"><span>Courriel général</span><input type="email" name="courriel" value="${esc(ct?.courriel)}"></label>
        <label class="champ"><span>Téléphone</span><input type="tel" name="telephone" value="${esc(ct?.telephone)}"></label>
        <label class="champ large"><span>Rôle pour toi (mandat)</span><textarea name="mandat" rows="2" placeholder="Ex. Transporteur LTL Québec–Ontario">${esc(u.mandat)}</textarea></label>
        <label class="champ large"><span>Notes</span><textarea name="notes" rows="3">${esc(ct?.notes)}</textarea></label>
        <p class="aide champ large" style="margin:0">La compagnie apparaît dans l’organigramme et dans les listes « Délégué à », « Promis à » et parties prenantes, sous son nom.</p>
      </div>
      <div class="pied"><button type="button" class="btn" data-fermer>Annuler</button><button type="submit" class="btn primaire">Enregistrer</button></div></form>`, async fd => {
      const t = k => (fd.get(k) || '').trim() || null;
      const ligneU = { nom: t('nom'), code: t('code'), mandat: t('mandat'), actif: fd.get('actif') === 'on', categorie: 'Organisation' };
      const r = nouveau ? await sb.from('unites').insert(ligneU).select('id').single() : await sb.from('unites').update(ligneU).eq('id', u.id).select('id').single();
      if (r.error) { toast('Échec : ' + r.error.message); return false; }
      const id = r.data.id;
      const ligneP = { nom: ligneU.nom, nature: 'Organisation', compagnie_id: id, courriel: t('courriel'), telephone: t('telephone'), notes: t('notes') };
      const r2 = ct ? await sb.from('personnes').update(ligneP).eq('id', ct.id) : await sb.from('personnes').insert(ligneP);
      if (r2.error) toast('Compagnie enregistrée, mais pas sa fiche de contact : ' + r2.error.message);
      else toast(nouveau ? 'Compagnie créée' : 'Enregistré');
      if (nouveau && S.vue === 'parties') S.filtres.compagnieId = id;
      rafraichir();
    });
  }

  function vuePersonnes() {
    const f = S.filtres, q = norm(f.qp), cie = f.ciePers || '';
    const gens = S.personnes.filter(p => p.nature !== 'Organisation')
      .filter(p => (!q || norm([p.nom, posteDe(p), p.courriel].join(' ')).includes(q)) && (!cie || (cie === 'aucune' ? !compagniePersonne(p) : compagniePersonne(p)?.id === cie)))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    return `<div class="outils"><input type="search" id="qp" placeholder="Chercher une personne" value="${esc(f.qp || '')}" aria-label="Chercher une personne">
        <select id="ciePers" aria-label="Compagnie"><option value="">Toutes les compagnies</option><option value="aucune" ${cie === 'aucune' ? 'selected' : ''}>Sans compagnie</option>${compagnies().map(u => `<option value="${u.id}" ${u.id === cie ? 'selected' : ''}>${esc(u.nom)}</option>`).join('')}</select>
        <button class="btn primaire" data-aj-pers>Ajouter une personne</button></div>
      ${bloc(pluriel(gens.length, 'personne'), null, gens.length ? `<table class="tableau"><thead><tr><th>Nom</th><th>Compagnie</th><th class="opt">Poste et département</th><th class="opt">Courriel</th><th>Me doit</th></tr></thead><tbody>
        ${gens.map(p => { const n = S.actions.filter(a => ouvert(a) && (a.delegue_a_id === p.id || a.en_attente_de_id === p.id)).length;
          return `<tr data-pers="${p.id}" tabindex="0"><td>${esc(p.nom)}${p.nature === 'Équipe' ? ' <span class="pastille">Équipe</span>' : ''}</td><td>${esc(compagniePersonne(p)?.nom || '—')}</td><td class="opt">${esc([posteDe(p), parId(S.unites, p.departement_id)?.nom].filter(Boolean).join(' · '))}</td><td class="opt">${esc(p.courriel || '')}</td><td>${n || ''}</td></tr>`; }).join('')}
        </tbody></table>` : vide('Aucune personne pour ces filtres.'))}`;
  }
  function brancherPersonnes(v) {
    const qp = v.querySelector('#qp');
    qp.oninput = () => { clearTimeout(brancherPersonnes.t); brancherPersonnes.t = setTimeout(() => { S.filtres.qp = qp.value; const p = qp.selectionStart; rendre(); const n = document.querySelector('#qp'); n.focus(); n.setSelectionRange(p, p); }, 200); };
    v.querySelector('#ciePers').onchange = e => { S.filtres.ciePers = e.target.value; rendre(); };
    v.querySelector('[data-aj-pers]').onclick = () => c.ouvrirPersonne({ nature: 'Personne', actif: true, compagnie_id: S.filtres.ciePers && S.filtres.ciePers !== 'aucune' ? S.filtres.ciePers : null });
    v.querySelectorAll('[data-pers]').forEach(r => { const go = () => c.ouvrirPersonne(parId(S.personnes, r.dataset.pers)); r.onclick = go; r.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  }

  /* =====================================================================
     4. DOMAINES DE VIE (dans Réglages)
     ===================================================================== */
  function complementReglages(v) {
    const col = v.querySelectorAll('.grille > .colonne')[0] || v;
    col.insertAdjacentHTML('beforeend', bloc('Domaines de vie', S.domaines.length, `<ul class="lignes">${S.domaines.map(d => {
      const n = S.actions.filter(a => a.domaine_id === d.id && ouvert(a)).length;
      return `<li class="ligne" data-dom="${d.id}" role="button" tabindex="0" style="grid-template-columns:1fr auto"><div><div class="titre">${esc(d.nom)}${d.actif === false ? ' <span class="pastille">Inactif</span>' : ''}</div><div class="meta">${esc(d.intention || '')}</div></div><div class="droite">${n} ouverte${n > 1 ? 's' : ''}</div></li>`;
    }).join('')}</ul>`, '<button class="btn" id="ajoutDomR">Ajouter</button>'));
    v.querySelector('#ajoutDomR').onclick = () => c.ouvrirDomaine({ actif: true });
    v.querySelectorAll('[data-dom]').forEach(r => r.onclick = () => c.ouvrirDomaine(parId(S.domaines, r.dataset.dom)));
  }

  return { vues: { parties: vueParties, note: vueNote }, synchro, restaurer, barreOnglets, brancherOnglets, ouvrir, ouvrirNote, avantRendre, editionEnCours,
    mdVersHtml, htmlVersMd, texteBrut, ficheCompagnie, compagnies, compagnieDe, sousUnites, complementReglages, ALIAS };
}
