// ORBITE · Lot 13 : compteur de cafés ☕
// Une ligne de la table `cafes` = un café, avec son heure (`pris_le`). Le compte affiché = les cafés dont
// l'heure tombe aujourd'hui dans le fuseau d'ORBITE (cleJour) : il revient à 0 tout seul à minuit.
// Le compte suit le compte Supabase : même nombre sur tous les appareils (rechargé à l'ouverture et au retour sur l'app).
// Affiché dans l'encadré « Compteurs » de l'accueil et dans la tuile « Chiffres du jour » du mode présentation.
// Migration : supabase/migrations/20261125_cafes.sql. Sans elle, le compteur reste caché (rien ne plante).
export function installerLot13(c) {
  const { sb, S, esc, toast, aujourdhui, cleJour, fmtHeure } = c;
  S.cafes = S.cafes || []; S.lot13 = false;

  // On lit les 36 dernières heures : couvre toute la journée en cours, peu importe le fuseau de l'appareil.
  async function charger() {
    try {
      const depuis = new Date(Date.now() - 36 * 3600e3).toISOString();
      const { data, error } = await sb.from('cafes').select('id,pris_le').gte('pris_le', depuis).order('pris_le');
      if (error) { S.lot13 = !!S.cafes.length && /fetch|network/i.test(error.message || ''); return; }
      S.cafes = data || []; S.lot13 = true;
    } catch { S.lot13 = !!S.cafes.length; }
  }

  const duJour = () => { const auj = aujourdhui(); return S.cafes.filter(x => cleJour(x.pris_le) === auj); };
  const libelle = n => n > 1 ? 'Cafés aujourd’hui' : 'Café aujourd’hui';
  const dernier = () => { const j = duJour(); return j.length ? `Dernier à ${fmtHeure.format(new Date(j[j.length - 1].pris_le))}` : 'Aucun encore'; };

  // Les écritures passent une à la fois, dans l'ordre des clics : un −1 juste après un +1 retire bien ce café-là.
  let file = Promise.resolve();
  const enFile = f => { file = file.then(f, f); return file; };

  function ajouter() {
    const o = { id: null, pris_le: new Date().toISOString() };
    S.cafes.push(o); majAffichage();
    enFile(async () => {
      const { data, error } = await sb.from('cafes').insert({ pris_le: o.pris_le }).select('id,pris_le').single();
      if (error) { S.cafes = S.cafes.filter(x => x !== o); majAffichage(); toast('Café non compté : ' + error.message); return; }
      o.id = data.id;
    });
  }
  function retirer() {
    const j = duJour();
    if (!j.length) return;
    const o = j[j.length - 1];
    S.cafes = S.cafes.filter(x => x !== o); majAffichage();
    enFile(async () => {
      if (!o.id) return; // son ajout a échoué : il n'existe pas dans Supabase
      const { error } = await sb.from('cafes').delete().eq('id', o.id);
      if (error) { S.cafes.push(o); S.cafes.sort((a, b) => a.pris_le.localeCompare(b.pris_le)); majAffichage(); toast('Café non retiré : ' + error.message); }
    });
  }

  // Met à jour tous les compteurs affichés (accueil et mode présentation) sans redessiner la page.
  function majAffichage() {
    const n = duJour().length;
    document.querySelectorAll('[data-cafes]').forEach(el => {
      el.querySelector('[data-cafes-n]').textContent = n;
      el.querySelector('[data-cafes-lib]').textContent = libelle(n);
      el.querySelector('[data-cafes-dernier]').textContent = dernier();
      const moins = el.querySelector('[data-cafe="-1"]'); if (moins) moins.disabled = !n;
      el.classList.toggle('calme', !n);
    });
  }
  // Passage de minuit sans recharger : le compte retombe à 0 dans la minute.
  setInterval(() => { if (S.lot13) majAffichage(); }, 60e3);

  const boutons = n => `<span class="cafe-boutons">
      <button type="button" class="btn cafe-moins" data-cafe="-1" ${n ? '' : 'disabled'} aria-label="Retirer le dernier café" title="Retirer le dernier café">−1</button>
      <button type="button" class="btn primaire cafe-plus" data-cafe="+1" aria-label="Ajouter un café" title="Ajouter un café">☕ +1</button>
    </span>`;

  // Tuile de l'encadré « Compteurs » de l'accueil (même gabarit que les autres compteurs).
  function compteur() {
    if (!S.lot13) return '';
    const n = duJour().length;
    return `<div class="compteur compteur-cafe${n ? '' : ' calme'}" data-cafes role="group" aria-label="Compteur de cafés">
      <span class="cafe-texte"><b data-cafes-n>${n}</b><span data-cafes-lib>${esc(libelle(n))}</span><small data-cafes-dernier>${esc(dernier())}</small></span>
      ${boutons(n)}</div>`;
  }
  // Chiffre de la tuile « Chiffres du jour » du mode présentation.
  function chiffre() {
    if (!S.lot13) return '';
    const n = duJour().length;
    return `<div class="pr-chiffre pr-cafe${n ? '' : ' calme'}" data-cafes role="group" aria-label="Compteur de cafés">
      <b data-cafes-n>${n}</b><span data-cafes-lib>${esc(libelle(n))}</span><small data-cafes-dernier>${esc(dernier())}</small>
      ${boutons(n)}</div>`;
  }
  const brancher = r => r.querySelectorAll('[data-cafe]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    if (b.dataset.cafe === '+1') ajouter(); else retirer();
  });

  return { charger, compteur, chiffre, brancher, ajouter, retirer };
}
