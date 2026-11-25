-- ORBITE · Lot 13 : compteur de cafés ☕
-- À exécuter une fois dans Supabase › SQL Editor (projet orbite), AVANT de pousser le code de l'interface.
-- Sans danger à réexécuter (if not exists / drop policy if exists).
--
-- cafes : une ligne = un café pris, avec son heure exacte (pris_le, en UTC comme tous les timestamptz).
--   Bouton « ☕ +1 » : ajoute une ligne à l'heure du clic.
--   Bouton « −1 »    : supprime la ligne la plus récente de la journée.
--   Le compte affiché = le nombre de lignes dont pris_le tombe aujourd'hui à l'heure de Toronto
--   (calculé par l'interface : il revient à 0 à minuit, sans tâche programmée). Les jours passés restent
--   dans la table : c'est l'historique.
--
-- Exemple de lecture de l'historique (cafés par jour, 30 derniers jours) :
--   select (pris_le at time zone 'America/Toronto')::date as jour, count(*) as cafes
--   from public.cafes group by 1 order by 1 desc limit 30;

create table if not exists public.cafes (
  id uuid primary key default gen_random_uuid(),
  pris_le timestamptz not null default now(),
  cree_le timestamptz not null default now()
);
comment on table public.cafes is 'Compteur de cafés : une ligne par café pris (historique horodaté).';
comment on column public.cafes.pris_le is 'Moment où le café a été compté (clic sur « ☕ +1 »).';
create index if not exists cafes_pris_le_idx on public.cafes (pris_le desc);

-- RLS : comme les autres tables d'ORBITE, seul le compte propriétaire lit et écrit.
alter table public.cafes enable row level security;
drop policy if exists "proprio tout" on public.cafes;
create policy "proprio tout" on public.cafes for all to authenticated using (prive.est_proprietaire()) with check (prive.est_proprietaire());
