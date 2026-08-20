-- Third wave: public read-only share links (recipes, fiches), and realtime
-- notifications when an admin changes a user's own access/role while they're
-- connected.

-- Share tokens are opaque random uuids, distinct from the row's own id, so a
-- link never leaks and can be revoked independently by nulling the column —
-- the id itself keeps working for everything else. Nullable/unique: null
-- means "not shared".
alter table public.a_table_recipes add column share_token uuid unique;
alter table public.el_profesor_fiches add column share_token uuid unique;

-- Realtime: lets a connected client be notified the moment an admin grants/
-- revokes a module access or changes their role, without polling. Both
-- tables already have owner-or-admin SELECT RLS (see init migration), which
-- Realtime enforces the same way REST does — a user only ever receives
-- change events for rows they could already select.
alter publication supabase_realtime add table public.user_app_access;
alter publication supabase_realtime add table public.profiles;
