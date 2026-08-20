"use server";

import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function getMyNote(subEntityId: string): Promise<string> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_notes")
    .select("content")
    .eq("user_id", profile.id)
    .eq("sub_entity_id", subEntityId)
    .maybeSingle();
  return data?.content ?? "";
}

/** Upserts the current user's note for a sub-entity — one row per user per sub-entity (unique constraint). */
export async function saveMyNote(subEntityId: string, content: string): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("el_profesor_notes")
    .upsert({ user_id: profile.id, sub_entity_id: subEntityId, content }, { onConflict: "user_id,sub_entity_id" });

  if (error) return { error: "Impossible d'enregistrer la note." };
  return { success: "" };
}

export interface BookNotesExport {
  content: string;
  hasNotes: boolean;
}

/** Aggregates the current user's personal notes across every sub-entity of a book into one downloadable text document. */
export async function exportBookNotes(bookId: string): Promise<BookNotesExport | { error: string }> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();

  const { data: book } = await supabase.from("el_profesor_books").select("title").eq("id", bookId).single();
  if (!book) return { error: "Livre introuvable." };

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, title, order_index").eq("book_id", bookId).order("order_index");
  const chapterIds = (chapters ?? []).map((c) => c.id);
  if (chapterIds.length === 0) return { content: `${book.title}\n\nAucune note.`, hasNotes: false };

  const { data: subEntities } = await supabase
    .from("el_profesor_sub_entities")
    .select("id, name, chapter_id, order_index")
    .in("chapter_id", chapterIds)
    .order("order_index");
  const subEntityIds = (subEntities ?? []).map((s) => s.id);
  if (subEntityIds.length === 0) return { content: `${book.title}\n\nAucune note.`, hasNotes: false };

  const { data: notes } = await supabase
    .from("el_profesor_notes")
    .select("sub_entity_id, content")
    .eq("user_id", profile.id)
    .in("sub_entity_id", subEntityIds);
  const noteByEntity = new Map((notes ?? []).filter((n) => n.content.trim()).map((n) => [n.sub_entity_id, n.content]));
  if (noteByEntity.size === 0) return { content: `${book.title}\n\nAucune note.`, hasNotes: false };

  const chapterTitleById = new Map((chapters ?? []).map((c) => [c.id, c.title]));
  const sections: string[] = [`${book.title} — mes notes`, ""];
  let currentChapterId: string | null = null;
  for (const sub of subEntities ?? []) {
    const content = noteByEntity.get(sub.id);
    if (!content) continue;
    if (sub.chapter_id !== currentChapterId) {
      currentChapterId = sub.chapter_id;
      sections.push(`## ${chapterTitleById.get(sub.chapter_id) ?? ""}`, "");
    }
    sections.push(`### ${sub.name}`, content, "");
  }

  return { content: sections.join("\n"), hasNotes: true };
}
