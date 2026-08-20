-- Hub notifications batch: in-app notification center, push subscriptions,
-- and per-user notification preferences (email digest opt-in/out, push
-- on/off — channel granularity; per-module granularity isn't meaningful
-- yet with only two modules, so it's channel-level for now).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'In-app notification center entries — access grants, changelog, security alerts.';

create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications for select to authenticated using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (auth.uid() = user_id);
-- No client insert policy: notifications are only ever created server-side
-- via the service-role client (they're system-generated, not user content).

grant select, update, delete on public.notifications to authenticated;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

comment on table public.push_subscriptions is 'Web Push subscriptions (one row per browser/device that opted in).';

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy "push_subscriptions_insert_own" on public.push_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy "push_subscriptions_delete_own" on public.push_subscriptions for delete to authenticated using (auth.uid() = user_id);

grant select, insert, delete on public.push_subscriptions to authenticated;

alter table public.profiles add column notify_email_digest boolean not null default true;
alter table public.profiles add column notify_push boolean not null default false;
