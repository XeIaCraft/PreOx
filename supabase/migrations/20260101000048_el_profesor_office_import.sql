-- Import direct depuis Word/PowerPoint, pas seulement PDF (item 5 de
-- l'audit). Un chapitre peut désormais venir d'un .docx/.pptx : le texte
-- brut est extrait côté serveur (jszip, pas de conversion PDF) et stocké
-- tel quel puisqu'il n'y a alors ni fichier binaire à envoyer à Gemini en
-- pièce jointe, ni pages réelles à citer — pdf_storage_path devient donc
-- nullable pour ces chapitres, et source_text porte le texte source à la
-- place. Un chapitre 'pdf' garde exactement son comportement actuel
-- (pdf_storage_path renseigné, source_text non utilisé).
alter table public.el_profesor_chapters
  alter column pdf_storage_path drop not null;

alter table public.el_profesor_chapters
  add column source_kind text not null default 'pdf' check (source_kind in ('pdf', 'docx', 'pptx'));

alter table public.el_profesor_chapters
  add column source_text text;

alter table public.el_profesor_chapters
  add constraint el_profesor_chapters_source_check check (
    (source_kind = 'pdf' and pdf_storage_path is not null) or
    (source_kind in ('docx', 'pptx') and source_text is not null)
  );
