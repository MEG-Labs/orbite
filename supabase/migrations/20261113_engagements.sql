-- ORBITE · Lot 7 · Engagements (ce que j'ai promis aux autres)
-- À exécuter une fois dans Supabase › SQL Editor (projet orbite), AVANT de pousser le code de l'interface.
-- Sans danger à réexécuter (if not exists / create or replace).
--
-- actions.promis_a_id : la personne à qui j'ai promis cette tâche (l'inverse de delegue_a_id).
--   Rempli par : Capture rapide (« Promis à »), fiche d'une action, interruption « À faire plus tard »
--   (si le demandeur est dans le répertoire), compte rendu (« - [ ] … → Nom »).
--   La date promise est l'échéance (actions.echeance) : aucune colonne de plus.
-- La reprise après interruption utilise le réglage `reprise` (table reglages) : aucune colonne non plus.
-- Le registre des décisions est lu dans les notes existantes : aucune table.

alter table public.actions
  add column if not exists promis_a_id uuid references public.personnes(id) on delete set null;
comment on column public.actions.promis_a_id is 'Personne à qui j''ai promis cette tâche (module Engagements).';
create index if not exists actions_promis_a_idx on public.actions (promis_a_id) where promis_a_id is not null;

-- Tâches récurrentes : l'occurrence suivante recopie aussi la promesse et le demandeur
-- (ex. « Rapport hebdo des retours → Jean-Pierre » chaque lundi). Identique à la version du 2026-11-11,
-- avec promis_a_id et demandeur ajoutés à la copie.
create or replace function prive.creer_occurrence_suivante(a public.actions) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare
  tz text := 'America/Toronto';
  r jsonb := a.recurrence;
  n int := greatest(coalesce((a.recurrence->>'intervalle')::int, 1), 1);
  auj date := (now() at time zone tz)::date;
  fait date := (coalesce(a.realisee_le, now()) at time zone tz)::date;
  ref date; prochaine date; delta int; k int := 0;
  num int := coalesce((a.recurrence->>'numero')::int, 1);
  nouv uuid;
begin
  if r is null or r->>'type' is null then return null; end if;
  -- Idempotent : rouvrir puis re-terminer ne crée pas de doublon.
  if exists (select 1 from actions where recurrence_precedent_id = a.id) then return null; end if;
  if r ? 'fin_nombre' and num >= (r->>'fin_nombre')::int then return null; end if;

  -- Date de référence de l'occurrence : échéance, sinon date planifiée, sinon date de réalisation.
  ref := coalesce(a.echeance, (a.planifie_debut at time zone tz)::date, fait);

  if coalesce(r->>'base', 'calendrier') = 'realisation' then
    prochaine := (fait + case r->>'type'
      when 'jours' then make_interval(days => n) when 'semaine' then make_interval(weeks => n)
      when 'mois' then make_interval(months => n) else make_interval(years => n) end)::date;
  else
    prochaine := prive.recurrence_apres(r, ref);
    while prochaine is not null and prochaine <= auj and k < 5000 loop
      prochaine := prive.recurrence_apres(r, prochaine); k := k + 1;
    end loop;
  end if;
  if prochaine is null then return null; end if;
  if r ? 'fin_date' and prochaine > (r->>'fin_date')::date then return null; end if;

  delta := prochaine - ref;
  insert into actions (titre, statut, type, priorite, planifie_debut, planifie_fin, journee_entiere, echeance, relance,
    prochain_geste, projet_id, domaine_id, hors_projet, dans_perimetre, delegue_a_id, en_attente_de_id, promis_a_id, demandeur, contexte, duree_min,
    lieu, reference_externe, notes, note_id, emplacement, departement, compagnie, probleme_signale,
    recurrence, recurrence_serie, recurrence_precedent_id)
  values (a.titre, 'À faire', a.type, a.priorite,
    case when a.planifie_debut is null then null else ((a.planifie_debut at time zone tz) + make_interval(days => delta)) at time zone tz end,
    case when a.planifie_fin is null then null else ((a.planifie_fin at time zone tz) + make_interval(days => delta)) at time zone tz end,
    a.journee_entiere,
    case when a.echeance is not null then a.echeance + delta when a.planifie_debut is null then prochaine end,
    case when a.relance is null then null else a.relance + delta end,
    a.prochain_geste, a.projet_id, a.domaine_id, a.hors_projet, a.dans_perimetre, a.delegue_a_id, a.en_attente_de_id, a.promis_a_id, a.demandeur, a.contexte, a.duree_min,
    a.lieu, a.reference_externe, a.notes, a.note_id, a.emplacement, a.departement, a.compagnie, a.probleme_signale,
    (r - 'sautee') || jsonb_build_object('numero', num + 1), coalesce(a.recurrence_serie, a.id), a.id)
  returning id into nouv;
  return nouv;
end $$;

revoke execute on function prive.creer_occurrence_suivante(public.actions) from public, anon, authenticated;

-- Vérification (doit renvoyer une ligne) :
-- select column_name from information_schema.columns where table_name = 'actions' and column_name = 'promis_a_id';
