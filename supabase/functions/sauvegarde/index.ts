// Sauvegarde hebdomadaire de toutes les tables dans le stockage privé « sauvegardes » (12 dernières conservées).
import { admin, autorise, cors, json, cleJour } from './commun.ts';

const TABLES = ['actions', 'projets', 'domaines', 'personnes', 'participations', 'vehicules', 'entretiens', 'interventions', 'interventions_entretiens',
  'livres', 'achats', 'abonnements', 'trajets', 'routines', 'notes', 'budget_lignes', 'regles_classement', 'unites', 'postes', 'postes_titulaires', 'reglages', 'journal_jours', 'cahiers'];

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  if (!await autorise(req, sb)) return json({ erreur: 'non autorisé' }, 401);
  const donnees: Record<string, unknown[]> = {};
  for (const t of TABLES) {
    const { data, error } = await sb.from(t).select('*');
    if (error) return json({ erreur: `${t} : ${error.message}` }, 500);
    donnees[t] = data;
  }
  const nom = `orbite-${cleJour(new Date())}.json`;
  const corps = JSON.stringify({ genere_le: new Date().toISOString(), tables: donnees });
  const { error } = await sb.storage.from('sauvegardes').upload(nom, new Blob([corps], { type: 'application/json' }), { upsert: true, contentType: 'application/json' });
  if (error) return json({ erreur: error.message }, 500);
  const { data: liste } = await sb.storage.from('sauvegardes').list('', { sortBy: { column: 'name', order: 'desc' }, limit: 100 });
  const vieux = (liste || []).filter(f => f.name.startsWith('orbite-')).slice(12).map(f => f.name);
  if (vieux.length) await sb.storage.from('sauvegardes').remove(vieux);
  return json({ fichier: nom, octets: corps.length, supprimes: vieux.length });
});
