-- Personal API token for read-only automation (GET /api/a-table/v1/summary).
-- Only a sha256 hash is stored — the raw token is shown once at generation
-- time and never persisted, same non-reversible-secret posture as password
-- hashing elsewhere in the hub (this is a bearer credential, not a value
-- the app ever needs to read back).
alter table public.a_table_settings add column api_token_hash text null;
