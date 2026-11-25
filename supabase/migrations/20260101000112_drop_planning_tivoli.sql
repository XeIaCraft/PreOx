-- Retrait du module « Planning Tivoli » : ses tables, sa fonction et sa
-- ligne dans le catalogue des applications.
drop function if exists public.planning_tivoli_set_cell(date, text, text);
drop table if exists public.planning_tivoli_cell_edits;
drop table if exists public.planning_tivoli_weeks;
drop table if exists public.planning_tivoli_people;
drop table if exists public.planning_tivoli_rooms;
drop table if exists public.planning_tivoli_ocr_fixes;
drop table if exists public.planning_tivoli_settings;
delete from public.apps where slug = 'planning-tivoli';
