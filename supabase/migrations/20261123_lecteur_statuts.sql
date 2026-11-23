-- ORBITE · Lecteur de statut (▶ Démarrer, ⏸ Pause, ⏮ Annuler) et chronomètre des tâches
-- À exécuter une fois dans Supabase › SQL Editor (projet orbite), AVANT de pousser le code de l'interface.
-- Sans danger à réexécuter (if exists / if not exists / create or replace).
--
-- 1. Nouveau statut « En pause » pour les actions (tâche commencée, mise de côté; reste ouverte).
-- 2. actions.chrono_debut : moment où la tâche est passée « En cours » (null = chrono arrêté).
--    Quand la tâche quitte « En cours » (peu importe comment : bouton ⏸, case à cocher, glisser vers Terminer,
--    fiche, fermeture de la journée, interruption), les minutes écoulées sont ajoutées à duree_reelle_min.
-- 3. actions.etat_precedent : l'état quitté au dernier changement de statut, pour le bouton ⏮ (annuler).
--    { statut, realisee_le, chrono_debut, duree_reelle_min, le } — le = moment du changement.
-- Le tout est tenu par un déclencheur côté serveur : le comportement est le même sur tous les appareils.

-- 1. Statut « En pause »
alter table public.actions drop constraint if exists actions_statut_check;
alter table public.actions add constraint actions_statut_check
  check (statut = any (array['À traiter', 'À faire', 'En cours', 'En pause', 'En attente', 'Bloqué', 'Terminé', 'Annulé']));

-- 2 et 3. Colonnes
alter table public.actions add column if not exists chrono_debut timestamptz;
alter table public.actions add column if not exists etat_precedent jsonb;
comment on column public.actions.chrono_debut is 'Début du chronomètre (tâche « En cours »). Null = arrêté. Les minutes s''ajoutent à duree_reelle_min quand la tâche quitte « En cours ».';
comment on column public.actions.etat_precedent is 'État quitté au dernier changement de statut (bouton ⏮ Annuler) : statut, realisee_le, chrono_debut, duree_reelle_min, le.';

create or replace function prive.action_chrono() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.statut = 'En cours' and new.chrono_debut is null then new.chrono_debut := now(); end if;
    return new;
  end if;
  if new.statut is not distinct from old.statut then return new; end if;

  -- État quitté, pour ⏮. (Annuler écrit à son tour l'état quitté : un 2e ⏮ rétablit.)
  new.etat_precedent := jsonb_build_object('statut', old.statut, 'realisee_le', old.realisee_le,
    'chrono_debut', old.chrono_debut, 'duree_reelle_min', old.duree_reelle_min, 'le', now());

  -- La tâche quitte « En cours » : on arrête le chrono et on ajoute le temps écoulé,
  -- sauf si l'appel règle lui-même chrono_debut (cas du bouton ⏮, qui restaure les valeurs d'avant).
  if old.statut = 'En cours' and old.chrono_debut is not null
     and new.chrono_debut is not distinct from old.chrono_debut then
    new.duree_reelle_min := coalesce(new.duree_reelle_min, 0)
      + greatest(round(extract(epoch from (now() - old.chrono_debut)) / 60.0)::int, 0);
    new.chrono_debut := null;
  end if;

  -- La tâche passe « En cours » : le chrono démarre (sauf si ⏮ restaure un chrono existant).
  if new.statut = 'En cours' and new.chrono_debut is null then
    new.chrono_debut := now();
  end if;
  -- Hors « En cours », pas de chrono qui tourne.
  if new.statut <> 'En cours' then new.chrono_debut := null; end if;
  return new;
end $$;

drop trigger if exists actions_chrono on public.actions;
create trigger actions_chrono before insert or update of statut on public.actions
  for each row execute function prive.action_chrono();
