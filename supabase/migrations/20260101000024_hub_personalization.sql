-- Hub personalization batch: accent theme, manual module order, list
-- density, and per-user dismissible homepage widgets.

alter table public.profiles add column accent_theme text not null default 'forest' check (accent_theme in ('forest', 'slate'));
alter table public.profiles add column app_order uuid[] not null default '{}';
alter table public.profiles add column density text not null default 'comfortable' check (density in ('comfortable', 'compact'));
alter table public.profiles add column hidden_widgets text[] not null default '{}';
