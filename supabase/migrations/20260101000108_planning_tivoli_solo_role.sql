-- Planning Tivoli : la personne seule dans une salle n'est pas toujours un
-- sénior. En « CON », c'est un PG ou un sénior : son rôle vient alors de la
-- correspondance des initiales (PG ou sénior), et reste à préciser s'il n'y
-- est pas.

alter table public.planning_tivoli_rooms
  add column solo text not null default 'senior' check (solo in ('senior', 'either'));

alter table public.planning_tivoli_people
  add column role text check (role in ('pg', 'senior'));

update public.planning_tivoli_rooms set solo = 'either' where upper(replace(image_label, ' ', '')) = 'CON';
