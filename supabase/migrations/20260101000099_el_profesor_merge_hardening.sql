-- Fusion de livres, compléments à la migration 098 (avant la première
-- grosse fusion) :
--   * un verrou court sur chaque fusion pendant le passage d'une étape à la
--     suivante — la file est relancée chaque minute et deux passages peuvent
--     se chevaucher ;
--   * la publication d'un chapitre fusionné en une seule requête, quel que
--     soit le nombre de cartes.
-- Les étapes s'appellent désormais : plan (parties, sous-parties) → assign
-- (chaque fiche → une sous-partie) → chapters (chapitres et fiches de chaque
-- sous-partie) → fiches → repair → done ; les valeurs de stage/statut de 098
-- ne changent pas.

alter table public.el_profesor_merge_jobs
  add column if not exists locked_until timestamptz;

-- Publication d'un chapitre fusionné : ses cartes remplacent les cartes
-- sources publiées qu'elles fusionnent (statut 'replaced', hors de toutes
-- les révisions) et chaque lecteur garde sur la carte fusionnée son
-- historique le plus avancé parmi ces sources (plus grande stabilité, puis
-- plus de répétitions), sans écraser une révision déjà faite sur la carte
-- fusionnée. Une carte source en brouillon reste un brouillon. Appelée par le
-- serveur (rôle service) après chaque publication ; sans effet sur un livre
-- ordinaire.
create or replace function public.el_profesor_replace_source_cards(p_fiche_ids uuid[])
returns table (replaced integer, histories integer)
language sql
volatile
security invoker
set search_path = public
as $$
  with map as (
    select distinct on (s.source_id) s.source_id, m.id as merged_id
    from public.el_profesor_flashcards m
    cross join lateral unnest(m.source_flashcard_ids) as s(source_id)
    where m.fiche_id = any(p_fiche_ids) and m.status = 'published' and s.source_id <> m.id
    order by s.source_id, m.created_at, m.id
  ),
  copied as (
    insert into public.el_profesor_review_state
      (user_id, flashcard_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review)
    select distinct on (rs.user_id, map.merged_id)
      rs.user_id, map.merged_id, rs.due, rs.stability, rs.difficulty, rs.elapsed_days, rs.scheduled_days, rs.reps, rs.lapses, rs.state, rs.last_review
    from map
    join public.el_profesor_flashcards src on src.id = map.source_id and src.status = 'published'
    join public.el_profesor_review_state rs on rs.flashcard_id = map.source_id
    order by rs.user_id, map.merged_id, rs.stability desc, rs.reps desc
    on conflict (user_id, flashcard_id) do nothing
    returning 1
  ),
  replaced as (
    update public.el_profesor_flashcards src
    set status = 'replaced', replaced_by_flashcard_id = map.merged_id
    from map
    where src.id = map.source_id and src.status = 'published'
    returning 1
  )
  select (select count(*) from replaced)::integer, (select count(*) from copied)::integer;
$$;

revoke all on function public.el_profesor_replace_source_cards(uuid[]) from public, anon, authenticated;
grant execute on function public.el_profesor_replace_source_cards(uuid[]) to service_role;
