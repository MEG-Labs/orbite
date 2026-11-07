import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

export const FUSEAU = 'America/Toronto';
export const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export async function secret(sb: ReturnType<typeof admin>, cle: string) {
  const { data } = await sb.from('secrets_serveur').select('valeur').eq('cle', cle).single();
  return data?.valeur as string | undefined;
}
export async function reglage(sb: ReturnType<typeof admin>, cle: string) {
  const { data } = await sb.from('reglages').select('valeur').eq('cle', cle).maybeSingle();
  return data?.valeur ?? null;
}

// Autorise : appel planifié (en-tête secret) ou propriétaire connecté (jeton utilisateur).
export async function autorise(req: Request, sb: ReturnType<typeof admin>) {
  const s = req.headers.get('x-orbite-secret');
  if (s && s === await secret(sb, 'cron')) return 'cron';
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const { data } = await sb.auth.getUser(jwt);
  if (!data?.user) return null;
  const { data: p } = await sb.from('proprietaire').select('user_id').eq('user_id', data.user.id).maybeSingle();
  return p ? 'proprietaire' : null;
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
export const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Dates locales
const fmtCle = new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit' });
export const cleJour = (d: Date | string) => fmtCle.format(new Date(d));
export const heureLocale = (d = new Date()) => +new Intl.DateTimeFormat('en-CA', { timeZone: FUSEAU, hour: '2-digit', hourCycle: 'h23' }).format(d);
export const fmtHeure = (d: Date | string) => new Intl.DateTimeFormat('fr-CA', { timeZone: FUSEAU, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
export const fmtJour = (cle: string) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(cle + 'T12:00:00Z'));
export const plusJours = (cle: string, n: number) => { const d = new Date(cle + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Heure locale (fuseau donné) -> Date UTC
export function depuisLocal(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, tz = FUSEAU) {
  const naif = Date.UTC(y, mo - 1, d, h, mi, s);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(naif)).map(x => [x.type, x.value]));
  const vu = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(naif - (vu - naif));
}
export const argent = (v: number | null) => v == null ? '' : new Intl.NumberFormat('fr-CA', { style: 'currency', currency: 'CAD' }).format(v);
