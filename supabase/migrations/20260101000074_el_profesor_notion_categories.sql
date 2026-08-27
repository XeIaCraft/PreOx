-- Groups notions into admin-defined categories (requested 2026-08-26 — the
-- glossary/dashboard "Par notion" view was becoming a long flat list once a
-- library covers many transversal topics). One level of grouping, manually
-- ordered and assigned — no AI involvement, same as every other purely
-- organizational tool in this module (books' order_index, chapters' etc.).
create table public.el_profesor_notion_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.el_profesor_notions
  add column category_id uuid references public.el_profesor_notion_categories (id) on delete set null;

create index el_profesor_notions_category_idx on public.el_profesor_notions (category_id);

alter table public.el_profesor_notion_categories enable row level security;

create policy "el_profesor_notion_categories_select" on public.el_profesor_notion_categories
  for select to authenticated
  using (public.has_module_access('el-profesor'));
create policy "el_profesor_notion_categories_admin_write" on public.el_profesor_notion_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.el_profesor_notion_categories to authenticated;
