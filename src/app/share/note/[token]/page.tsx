import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ElProfesorSubEntityRow, ElProfesorChapterRow } from "@/lib/supabase/types";

export const metadata = { title: "Note partagée" };

/**
 * Public, unauthenticated read-only view of one shared personal note — same
 * trust model as the fiche/recipe share pages: an unguessable share_token
 * gates the row, not a session check. Only the note the author explicitly
 * shared is ever reachable this way — every other note stays private.
 */
export default async function SharedNotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: note } = await supabase.from("el_profesor_notes").select("content, sub_entity_id").eq("share_token", token).maybeSingle();
  if (!note || !note.content.trim()) notFound();

  const { data: subEntity } = await supabase.from("el_profesor_sub_entities").select("*").eq("id", note.sub_entity_id).single();
  if (!subEntity) notFound();

  const { data: chapter } = await supabase
    .from("el_profesor_chapters")
    .select("*")
    .eq("id", (subEntity as ElProfesorSubEntityRow).chapter_id)
    .single();
  const { data: book } = chapter
    ? await supabase.from("el_profesor_books").select("title").eq("id", (chapter as ElProfesorChapterRow).book_id).single()
    : { data: null };

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Logo />
      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        Note partagée depuis El Profesor{book ? ` — ${book.title}` : ""}
      </p>
      <h1 className="mt-2 font-serif-display text-2xl font-medium text-foreground">{subEntity.name}</h1>
      {chapter && <p className="mt-1 text-sm text-foreground-subtle">{chapter.title}</p>}
      <div className="mt-6 whitespace-pre-wrap rounded-[var(--radius-lg)] border border-border bg-surface p-5 text-sm leading-relaxed text-foreground">
        {note.content}
      </div>
    </div>
  );
}
