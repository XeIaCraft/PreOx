-- An admin chooses, in the profile's settings, whether the modules open in
-- their admin view or as a normal user sees them (studying, or using Préop
-- day to day, is easier without the admin tools). The switch inside a
-- module (« Vue utilisateur » / « Vue admin ») still changes it for the
-- moment, on that device (src/lib/auth/view-mode.ts). Meaningless for a
-- non-admin, who only ever has the user view.
alter table public.profiles add column default_view text not null default 'admin' check (default_view in ('admin', 'user'));
