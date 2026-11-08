-- Planning Tivoli : lien public en lecture seule. Le jeton figure dans
-- l'adresse (/share/planning-tivoli/<jeton>) ; il est gardé en clair pour
-- pouvoir réafficher le lien, et ne donne accès qu'au planning validé
-- (noms de soignants, aucune donnée patient). Régénérer ou révoquer le
-- jeton désactive l'ancien lien.
alter table public.planning_tivoli_settings add column share_token text;
create unique index planning_tivoli_settings_share_token_idx on public.planning_tivoli_settings (share_token) where share_token is not null;
