-- ORBITE · Lot 11 : bacs à sable, « Je pars sur le plancher » et feuille de temps
-- À exécuter une fois dans Supabase › SQL Editor (projet orbite), AVANT de pousser le code de l'interface.
-- Exige la migration 20261123_lecteur_statuts.sql (chrono des tâches). Sans danger à réexécuter.
--
-- 1. bacs_sable : qui est propriétaire de quel processus dans l'équipe (« amélioration » → Yan, etc.).
--    bacs_sable_historique : les propriétaires précédents (rempli automatiquement quand le propriétaire change).
-- 2. seances : la feuille de temps. Une ligne = une période de temps.
--    type 'chrono'   : une séance ▶ → ⏸ (ou → Terminé…) d'une tâche. Écrite par le déclencheur actions_chrono
--                      quand le chrono s'arrête, ou par l'interface quand elle corrige un chrono (interruption, fly).
--    type 'plancher' : une période « sur le plancher » (bouton Plancher → De retour).
--    Les interruptions, le fly et les événements de l'agenda ne sont pas copiés ici : la feuille de temps les lit
--    directement dans actions.
--    La période « sur le plancher » en cours est dans le réglage `plancher` = { depuis, pauses: [ids], note }.

-- ============ 1. Bacs à sable ============
create table if not exists public.bacs_sable (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  description text,
  mots_cles text[] not null default '{}',
  proprietaire_id uuid references public.personnes(id) on delete set null,
  depuis date not null default ((now() at time zone 'America/Toronto')::date),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now()
);
comment on table public.bacs_sable is 'Processus de l''équipe et leur propriétaire (à qui appartient quoi).';
comment on column public.bacs_sable.mots_cles is 'Mots qui signalent ce processus dans le titre d''une tâche ou d''un projet (avertissement « appartient à … »).';

create table if not exists public.bacs_sable_historique (
  id uuid primary key default gen_random_uuid(),
  bac_id uuid not null references public.bacs_sable(id) on delete cascade,
  proprietaire_id uuid references public.personnes(id) on delete set null,
  proprietaire_nom text,           -- copie du nom au moment de la passation (reste lisible si la personne est supprimée)
  debut date,
  fin date not null,
  cree_le timestamptz not null default now()
);
create index if not exists bacs_sable_historique_bac_idx on public.bacs_sable_historique (bac_id, fin desc);

create or replace function prive.bac_sable_passation() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare auj date := (now() at time zone 'America/Toronto')::date;
begin
  new.maj_le := now();
  if new.proprietaire_id is distinct from old.proprietaire_id then
    if old.proprietaire_id is not null then
      insert into bacs_sable_historique (bac_id, proprietaire_id, proprietaire_nom, debut, fin)
      values (old.id, old.proprietaire_id, (select nom from personnes where id = old.proprietaire_id), old.depuis, auj);
    end if;
    if new.depuis is not distinct from old.depuis then new.depuis := auj; end if;
  end if;
  return new;
end $$;
drop trigger if exists bacs_sable_passation on public.bacs_sable;
create trigger bacs_sable_passation before update on public.bacs_sable
  for each row execute function prive.bac_sable_passation();

-- ============ 2. Séances (feuille de temps) ============
create table if not exists public.seances (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'chrono' check (type in ('chrono', 'plancher')),
  action_id uuid references public.actions(id) on delete cascade,
  debut timestamptz not null,
  fin timestamptz not null,
  minutes integer generated always as (greatest(round(extract(epoch from (fin - debut)) / 60.0)::int, 0)) stored,
  note text,
  cree_le timestamptz not null default now(),
  check (fin >= debut)
);
create index if not exists seances_debut_idx on public.seances (debut);
create index if not exists seances_action_idx on public.seances (action_id) where action_id is not null;

-- RLS : comme les autres tables d'ORBITE, seul le compte propriétaire lit et écrit.
alter table public.bacs_sable enable row level security;
alter table public.bacs_sable_historique enable row level security;
alter table public.seances enable row level security;
drop policy if exists "proprio tout" on public.bacs_sable;
drop policy if exists "proprio tout" on public.bacs_sable_historique;
drop policy if exists "proprio tout" on public.seances;
create policy "proprio tout" on public.bacs_sable for all to authenticated using (prive.est_proprietaire()) with check (prive.est_proprietaire());
create policy "proprio tout" on public.bacs_sable_historique for all to authenticated using (prive.est_proprietaire()) with check (prive.est_proprietaire());
create policy "proprio tout" on public.seances for all to authenticated using (prive.est_proprietaire()) with check (prive.est_proprietaire());

-- Chrono : même déclencheur qu'au lot du 2026-11-23, plus l'écriture de la séance quand le chrono s'arrête.
create or replace function prive.action_chrono() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.statut = 'En cours' and new.chrono_debut is null then new.chrono_debut := now(); end if;
    return new;
  end if;
  if new.statut is not distinct from old.statut then return new; end if;

  new.etat_precedent := jsonb_build_object('statut', old.statut, 'realisee_le', old.realisee_le,
    'chrono_debut', old.chrono_debut, 'duree_reelle_min', old.duree_reelle_min, 'le', now());

  if old.statut = 'En cours' and old.chrono_debut is not null
     and new.chrono_debut is not distinct from old.chrono_debut then
    new.duree_reelle_min := coalesce(new.duree_reelle_min, 0)
      + greatest(round(extract(epoch from (now() - old.chrono_debut)) / 60.0)::int, 0);
    -- Feuille de temps : la séance qui vient de se terminer.
    if now() > old.chrono_debut then
      insert into seances (type, action_id, debut, fin) values ('chrono', old.id, old.chrono_debut, now());
    end if;
    new.chrono_debut := null;
  end if;

  if new.statut = 'En cours' and new.chrono_debut is null then
    new.chrono_debut := now();
  end if;
  if new.statut <> 'En cours' then new.chrono_debut := null; end if;
  return new;
end $$;
