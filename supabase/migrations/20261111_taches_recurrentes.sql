-- ORBITE · Tâches récurrentes
-- À exécuter une fois dans Supabase › SQL Editor (projet orbite), AVANT de pousser le code de l'interface.
-- Principe : une seule occurrence ouverte à la fois. Quand une tâche récurrente passe à « Terminé »,
-- la suivante est créée automatiquement (déclencheur), quelle que soit la façon dont elle a été terminée
-- (case à cocher, glisser vers Terminer, fiche, rituel de fermeture…).
--
-- Règle (colonne actions.recurrence, jsonb) :
--   type          'jours' | 'semaine' | 'mois' | 'annee'
--   intervalle    entier ≥ 1 (tous les N jours / semaines / mois / ans)
--   base          'calendrier' (selon la règle, peu importe quand c'est fait) | 'realisation' (N unités après l'avoir faite)
--   jours         [1..7] jours ISO (1 = lundi … 7 = dimanche), pour type 'semaine' en base calendrier
--   mode_mois     'jour' (le X du mois) | 'rang' (le 1er/2e/3e/4e/dernier <jour> du mois), pour 'mois'
--   jour_mois     1..31, ou -1 = dernier jour du mois (mode 'jour', et pour 'annee')
--   rang          1..4, ou -1 = dernier (mode 'rang')
--   jour_semaine  1..7 (mode 'rang')
--   mois_annee    1..12 (type 'annee')
--   fin_date      'AAAA-MM-JJ' facultatif : aucune occurrence après cette date
--   fin_nombre    entier facultatif : nombre total d'occurrences de la série
--   numero        rang de cette occurrence dans la série (1 pour la première)
--   sautee        true si l'occurrence a été sautée (statut Annulé)

alter table public.actions
  add column if not exists recurrence jsonb,
  add column if not exists recurrence_serie uuid,
  add column if not exists recurrence_precedent_id uuid references public.actions(id) on delete set null;
create index if not exists actions_recurrence_precedent_idx on public.actions (recurrence_precedent_id);
create index if not exists actions_recurrence_serie_idx on public.actions (recurrence_serie);

-- Date candidate dans un mois donné (m = 1er du mois).
create or replace function prive.recurrence_dans_mois(r jsonb, m date) returns date
language plpgsql immutable set search_path to 'public' as $$
declare
  dernier date := (m + interval '1 month' - interval '1 day')::date;
  j int; rg int; js int; d date;
begin
  if coalesce(r->>'mode_mois', 'jour') = 'rang' then
    rg := coalesce((r->>'rang')::int, 1);
    js := coalesce((r->>'jour_semaine')::int, 1);
    if rg = -1 then
      return dernier - ((extract(isodow from dernier)::int - js + 7) % 7);
    end if;
    d := m + ((js - extract(isodow from m)::int + 7) % 7) + 7 * (rg - 1);
    if d > dernier then d := d - 7; end if;
    return d;
  end if;
  j := coalesce((r->>'jour_mois')::int, 1);
  if j = -1 or j > extract(day from dernier)::int then return dernier; end if;
  return m + (j - 1);
end $$;

-- Première date strictement après « depuis » qui respecte la règle (base calendrier).
create or replace function prive.recurrence_apres(r jsonb, depuis date) returns date
language plpgsql immutable set search_path to 'public' as $$
declare
  n int := greatest(coalesce((r->>'intervalle')::int, 1), 1);
  t text := r->>'type';
  js int[]; lundi date; d date; m date; mo int; j int; y int; dern int; i int;
begin
  if t = 'jours' then return depuis + n; end if;
  if t = 'semaine' then
    select array_agg(x::int order by x::int) into js from jsonb_array_elements_text(coalesce(r->'jours', '[]'::jsonb)) x;
    if js is null then js := array[extract(isodow from depuis)::int]; end if;
    lundi := depuis - (extract(isodow from depuis)::int - 1);
    -- Reste de la semaine en cours.
    for i in 1..6 loop
      d := depuis + i;
      exit when d >= lundi + 7;
      if extract(isodow from d)::int = any(js) then return d; end if;
    end loop;
    -- Sinon : premier jour retenu de la semaine N plus loin.
    return lundi + 7 * n + (js[1] - 1);
  end if;
  if t = 'mois' then
    m := date_trunc('month', depuis)::date;
    d := prive.recurrence_dans_mois(r, m);
    if d > depuis then return d; end if;
    return prive.recurrence_dans_mois(r, (m + make_interval(months => n))::date);
  end if;
  if t = 'annee' then
    mo := coalesce((r->>'mois_annee')::int, extract(month from depuis)::int);
    j := coalesce((r->>'jour_mois')::int, extract(day from depuis)::int);
    y := extract(year from depuis)::int;
    for i in 0..1 loop
      dern := extract(day from (make_date(y, mo, 1) + interval '1 month' - interval '1 day'))::int;
      d := make_date(y, mo, case when j = -1 or j > dern then dern else j end);
      if d > depuis then return d; end if;
      y := y + n;
    end loop;
    return d;
  end if;
  return null;
end $$;

-- Crée l'occurrence suivante d'une tâche récurrente. Renvoie son id, ou null (pas de règle, série finie, déjà créée).
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
    -- Selon le calendrier : la prochaine date de la règle après la date prévue, jamais aujourd'hui ni dans le passé
    -- (une seule occurrence à la fois : les dates manquées sont sautées).
    prochaine := prive.recurrence_apres(r, ref);
    while prochaine is not null and prochaine <= auj and k < 5000 loop
      prochaine := prive.recurrence_apres(r, prochaine); k := k + 1;
    end loop;
  end if;
  if prochaine is null then return null; end if;
  if r ? 'fin_date' and prochaine > (r->>'fin_date')::date then return null; end if;

  delta := prochaine - ref;
  insert into actions (titre, statut, type, priorite, planifie_debut, planifie_fin, journee_entiere, echeance, relance,
    prochain_geste, projet_id, domaine_id, hors_projet, dans_perimetre, delegue_a_id, en_attente_de_id, contexte, duree_min,
    lieu, reference_externe, notes, note_id, emplacement, departement, compagnie, probleme_signale,
    recurrence, recurrence_serie, recurrence_precedent_id)
  values (a.titre, 'À faire', a.type, a.priorite,
    case when a.planifie_debut is null then null else ((a.planifie_debut at time zone tz) + make_interval(days => delta)) at time zone tz end,
    case when a.planifie_fin is null then null else ((a.planifie_fin at time zone tz) + make_interval(days => delta)) at time zone tz end,
    a.journee_entiere,
    case when a.echeance is not null then a.echeance + delta when a.planifie_debut is null then prochaine end,
    case when a.relance is null then null else a.relance + delta end,
    a.prochain_geste, a.projet_id, a.domaine_id, a.hors_projet, a.dans_perimetre, a.delegue_a_id, a.en_attente_de_id, a.contexte, a.duree_min,
    a.lieu, a.reference_externe, a.notes, a.note_id, a.emplacement, a.departement, a.compagnie, a.probleme_signale,
    (r - 'sautee') || jsonb_build_object('numero', num + 1), coalesce(a.recurrence_serie, a.id), a.id)
  returning id into nouv;
  return nouv;
end $$;

-- Déclencheur : passage à « Terminé ».
create or replace function prive.action_recurrence() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform prive.creer_occurrence_suivante(new);
  return null;
end $$;
drop trigger if exists actions_recurrence on public.actions;
create trigger actions_recurrence after update of statut on public.actions
  for each row when (new.statut = 'Terminé' and old.statut is distinct from 'Terminé' and new.recurrence is not null)
  execute function prive.action_recurrence();

-- « Sauter » : crée la suivante et annule celle-ci (marquée sautée), sans la compter comme faite.
create or replace function public.sauter_occurrence(p_id uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare a actions; nouv uuid;
begin
  if not prive.est_proprietaire() then raise exception 'Accès refusé'; end if;
  select * into a from actions where id = p_id;
  if not found then raise exception 'Action introuvable'; end if;
  if a.recurrence is null then raise exception 'Cette action n''est pas récurrente'; end if;
  nouv := prive.creer_occurrence_suivante(a);
  update actions set statut = 'Annulé', recurrence = recurrence || '{"sautee": true}'::jsonb where id = p_id;
  return nouv;
end $$;

revoke execute on function prive.creer_occurrence_suivante(public.actions) from public, anon, authenticated;
revoke execute on function public.sauter_occurrence(uuid) from public, anon;
grant execute on function public.sauter_occurrence(uuid) to authenticated;
