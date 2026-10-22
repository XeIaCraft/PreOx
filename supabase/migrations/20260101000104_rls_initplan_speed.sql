-- Access rules evaluated once per query instead of once per row.
--
-- Every RLS policy called is_admin(), has_module_access(…) or auth.uid()
-- bare: Postgres runs such a call again for each row it checks. Since the
-- merged book (≈ 100,000 blocks and cards), counting the flashcards alone
-- took 23 s for a signed-in admin and the sync's manifest went past its
-- 55 s limit. Wrapped in (select …), the call becomes an initPlan, run
-- once per statement — what each policy allows doesn't change.
-- (Supabase's own advice: "Call functions with select", RLS performance.)

do $$
declare
  p record;
  new_qual text;
  new_check text;
  wrap constant text := '(select ';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(is_admin|has_module_access|auth\.uid)\(' or coalesce(with_check, '') ~ '(is_admin|has_module_access|auth\.uid)\(')
  loop
    -- Already rewritten (this migration run twice): left alone.
    if coalesce(p.qual, '') ~* 'select (auth\.uid|is_admin|has_module_access)\(' or coalesce(p.with_check, '') ~* 'select (auth\.uid|is_admin|has_module_access)\(' then
      continue;
    end if;

    new_qual := p.qual;
    new_check := p.with_check;
    if new_qual is not null then
      new_qual := regexp_replace(new_qual, 'has_module_access\(''([^'']*)''::text\)', wrap || 'has_module_access(''\1''::text))', 'g');
      new_qual := regexp_replace(new_qual, 'is_admin\(\)', wrap || 'is_admin())', 'g');
      new_qual := regexp_replace(new_qual, 'auth\.uid\(\)', wrap || 'auth.uid())', 'g');
    end if;
    if new_check is not null then
      new_check := regexp_replace(new_check, 'has_module_access\(''([^'']*)''::text\)', wrap || 'has_module_access(''\1''::text))', 'g');
      new_check := regexp_replace(new_check, 'is_admin\(\)', wrap || 'is_admin())', 'g');
      new_check := regexp_replace(new_check, 'auth\.uid\(\)', wrap || 'auth.uid())', 'g');
    end if;

    if new_qual is not null and new_check is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)', p.policyname, p.schemaname, p.tablename, new_qual, new_check);
    elsif new_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, new_qual);
    else
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, new_check);
    end if;
  end loop;
end $$;

-- The last change of a fiche's blocks and cards read from these indexes
-- alone, without going through the rows (≈ 75 MB each).
create index if not exists el_profesor_fiche_blocks_fiche_updated_idx on public.el_profesor_fiche_blocks (fiche_id, updated_at);
create index if not exists el_profesor_flashcards_fiche_updated_idx on public.el_profesor_flashcards (fiche_id, updated_at);

-- Last change of each chapter (the sync's delta). Joining blocks and cards
-- in one go multiplied them (every block × every card of a fiche): each
-- level is now aggregated on its own.
create or replace function public.el_profesor_chapter_last_modified(p_chapter_ids uuid[])
returns table (chapter_id uuid, last_modified_at timestamptz)
language sql
stable
set search_path = public
as $$
  with ch as (
    select c.id, c.updated_at from public.el_profesor_chapters c where c.id = any(p_chapter_ids)
  ),
  se as (
    select s.id, s.chapter_id, s.updated_at from public.el_profesor_sub_entities s join ch on ch.id = s.chapter_id
  ),
  fi as (
    select f.id, se.chapter_id, f.updated_at from public.el_profesor_fiches f join se on se.id = f.sub_entity_id
  ),
  changes as (
    select se.chapter_id, se.updated_at from se
    union all
    select fi.chapter_id, fi.updated_at from fi
    union all
    select fi.chapter_id, max(fb.updated_at) from public.el_profesor_fiche_blocks fb join fi on fi.id = fb.fiche_id group by fi.chapter_id
    union all
    select fi.chapter_id, max(fc.updated_at) from public.el_profesor_flashcards fc join fi on fi.id = fc.fiche_id group by fi.chapter_id
  )
  select ch.id, greatest(ch.updated_at, max(changes.updated_at))
  from ch
  left join changes on changes.chapter_id = ch.id
  group by ch.id, ch.updated_at;
$$;
