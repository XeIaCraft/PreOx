-- Public, unauthenticated "repas du jour" widget — same opaque-token trust
-- model as a_table_recipes.share_token: a random uuid gates a single,
-- narrowly-scoped public read, not a role check. Revoking the widget just
-- clears the token.
alter table public.a_table_settings add column today_widget_token uuid null unique;
