// Statut Jira des actions dont la référence externe ressemble à CANAC-123.
// Inactive tant que les secrets JIRA_COURRIEL et JIRA_JETON ne sont pas définis dans Supabase (Edge Functions > Secrets).
import { admin, autorise, reglage, cors, json } from './commun.ts';

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  if (!await autorise(req, sb)) return json({ erreur: 'non autorisé' }, 401);
  const courriel = Deno.env.get('JIRA_COURRIEL'), jeton = Deno.env.get('JIRA_JETON');
  if (!courriel || !jeton) return json({ actif: false, raison: 'Secrets JIRA_COURRIEL et JIRA_JETON absents' });
  const domaine = (await reglage(sb, 'jira_domaine')) || 'canac.atlassian.net';
  const { data: actions } = await sb.from('actions').select('id,reference_externe').not('reference_externe', 'is', null);
  const cibles = (actions || []).filter(a => /^[A-Z][A-Z0-9]+-\d+$/.test(a.reference_externe.trim()));
  if (!cibles.length) return json({ actif: true, maj: 0 });
  const cles = [...new Set(cibles.map(a => a.reference_externe.trim()))];
  const r = await fetch(`https://${domaine}/rest/api/3/search/jql`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${courriel}:${jeton}`), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jql: `key in (${cles.join(',')})`, fields: ['status'], maxResults: 100 }),
  });
  if (!r.ok) return json({ actif: true, erreur: `Jira ${r.status}` }, 502);
  const { issues } = await r.json();
  const statut: Record<string, string> = Object.fromEntries((issues || []).map((i: { key: string; fields: { status: { name: string } } }) => [i.key, i.fields.status.name]));
  let maj = 0;
  for (const a of cibles) {
    const s = statut[a.reference_externe.trim()];
    if (!s) continue;
    await sb.from('actions').update({ statut_jira: s, jira_maj_le: new Date().toISOString() }).eq('id', a.id);
    maj++;
  }
  return json({ actif: true, maj });
});
