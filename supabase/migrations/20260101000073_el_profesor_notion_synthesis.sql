-- Vraie fusion inter-livres par notion (repris le 2026-08-26 — le
-- "chantier unification thématique inter-livres" avait jusqu'ici seulement
-- livré le lien entre fiches et la détection de contradictions/quasi-
-- doublons : lire une notion voulait toujours dire ouvrir chaque livre un
-- par un, et "Réviser ce thème" ne mélangeait que les flashcards. Une
-- "synthèse" est une fiche générée par IA à partir des fiches liées à la
-- notion (hors fusionnées/obsolètes), dédupliquée mais avec le détail
-- propre à chaque livre conservé, publiée par un admin comme le reste du
-- contenu généré par IA du module.
create table public.el_profesor_notion_syntheses (
  id uuid primary key default gen_random_uuid(),
  notion_id uuid not null unique references public.el_profesor_notions (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'published')),
  -- Fiche ids actually fed into the last generation — compared against the
  -- notion's current linked (non-superseded) fiches to detect staleness (a
  -- newly linked/unlinked/superseded fiche means "à régénérer").
  source_fiche_ids uuid[] not null default '{}',
  model text,
  generated_at timestamptz,
  generated_by uuid references public.profiles (id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.el_profesor_notion_synthesis_blocks (
  id uuid primary key default gen_random_uuid(),
  synthesis_id uuid not null references public.el_profesor_notion_syntheses (id) on delete cascade,
  order_index integer not null default 0,
  block_type text not null,
  content jsonb not null,
  -- Every citation here is carried over verbatim from the original source
  -- block(s) it was merged from (never invented by the synthesis model —
  -- see buildNotionSynthesisPrompt's doc comment), tagged with which
  -- book/chapter/fiche it came from since one synthesized block can now
  -- span more than one book's own PDF.
  citations jsonb not null default '[]',
  source_fiche_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index el_profesor_notion_synthesis_blocks_synthesis_idx on public.el_profesor_notion_synthesis_blocks (synthesis_id, order_index);

create trigger set_el_profesor_notion_syntheses_updated_at
  before update on public.el_profesor_notion_syntheses
  for each row execute function public.set_updated_at();

alter table public.el_profesor_notion_syntheses enable row level security;
alter table public.el_profesor_notion_synthesis_blocks enable row level security;

create policy "el_profesor_notion_syntheses_select" on public.el_profesor_notion_syntheses
  for select to authenticated
  using ((status = 'published' or public.is_admin()) and public.has_module_access('el-profesor'));
create policy "el_profesor_notion_syntheses_admin_write" on public.el_profesor_notion_syntheses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "el_profesor_notion_synthesis_blocks_select" on public.el_profesor_notion_synthesis_blocks
  for select to authenticated
  using (
    public.has_module_access('el-profesor')
    and (
      public.is_admin()
      or exists (
        select 1 from public.el_profesor_notion_syntheses s
        where s.id = synthesis_id and s.status = 'published'
      )
    )
  );
create policy "el_profesor_notion_synthesis_blocks_admin_write" on public.el_profesor_notion_synthesis_blocks
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.el_profesor_notion_syntheses to authenticated;
grant select, insert, update, delete on public.el_profesor_notion_synthesis_blocks to authenticated;
