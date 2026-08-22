-- Family voting on generated proposals (item 4 of the backlog). No new
-- accounts: family members vote through an unguessable public link (same
-- trust model as a_table_recipes.share_token), not by being hub users.
-- `votes` maps proposal index (as text, since jsonb object keys are always
-- strings) to the array of anonymous voter ids (a random id generated and
-- kept in the voting page's localStorage) who picked it — array length is
-- the tally, and a voter can toggle their own pick back off.
alter table public.a_table_drafts add column vote_token uuid null unique;
alter table public.a_table_drafts add column votes jsonb not null default '{}'::jsonb;
