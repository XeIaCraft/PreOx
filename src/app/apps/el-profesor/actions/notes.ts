"use server";

import { randomUUID } from "node:crypto";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error?: string;
  success?: string;
}

export interface MyNote {
  content: string;
  shareToken: string | null;
}

export async function getMyNote(subEntityId: string): Promise<MyNote> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  const { data } = await supabase
    .from("el_profesor_notes")
    .select("content, share_token")
    .eq("user_id", profile.id)
    .eq("sub_entity_id", subEntityId)
    .maybeSingle();
  return { content: data?.content ?? "", shareToken: data?.share_token ?? null };
}

/**
 * Toggles a public, read-only share link for one personal note — selective
 * sharing (item 27 of the backlog): only the note you explicitly share
 * becomes visible to whoever has the link, every other note stays private.
 * Uses the service-role client for the scoped update (el_profesor_notes'
 * RLS is strictly per-user with no admin bypass — see the schema note —
 * so a plain client update on someone else's note would just no-op under
 * RLS; the admin client plus the explicit .eq("user_id", ...) below keeps
 * this scoped to the caller's own row regardless).
 */
export async function toggleNoteShare(subEntityId: string, share: boolean): Promise<ActionState & { shareToken?: string | null }> {
  const profile = await requireElProfesorAccess();
  const shareToken = share ? randomUUID() : null;
  const admin = createAdminClient();
  const { error } = await admin
    .from("el_profesor_notes")
    .update({ share_token: shareToken })
    .eq("user_id", profile.id)
    .eq("sub_entity_id", subEntityId);
  if (error) return { error: "Impossible de mettre à jour le partage." };
  return { success: share ? "Lien de partage créé." : "Partage désactivé.", shareToken };
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

export interface NoteSearchResult {
  subEntityId: string;
  subEntityName: string;
  chapterId: string;
  chapterTitle: string;
  bookTitle: string;
  snippet: string;
}

/** Full-text search (ilike) across the current user's own personal notes only — never other users' notes. */
export async function searchMyNotes(query: string): Promise<NoteSearchResult[]> {
  const profile = await requireElProfesorAccess();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("el_profesor_notes")
    .select("sub_entity_id, content")
    .eq("user_id", profile.id)
    .ilike("content", `%${trimmed}%`)
    .limit(30);
  if (!notes || notes.length === 0) return [];

  const subEntityIds = notes.map((n) => n.sub_entity_id);
  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id, name, chapter_id").in("id", subEntityIds);
  const subEntityById = new Map((subEntities ?? []).map((s) => [s.id, s]));

  const chapterIds = [...new Set((subEntities ?? []).map((s) => s.chapter_id))];
  const { data: chapters } = chapterIds.length > 0 ? await supabase.from("el_profesor_chapters").select("id, title, book_id").in("id", chapterIds) : { data: [] };
  const chapterById = new Map((chapters ?? []).map((c) => [c.id, c]));

  const bookIds = [...new Set((chapters ?? []).map((c) => c.book_id))];
  const { data: books } = bookIds.length > 0 ? await supabase.from("el_profesor_books").select("id, title").in("id", bookIds) : { data: [] };
  const bookTitleById = new Map((books ?? []).map((b) => [b.id, b.title]));

  const results: NoteSearchResult[] = [];
  for (const note of notes) {
    const sub = subEntityById.get(note.sub_entity_id);
    const chapter = sub ? chapterById.get(sub.chapter_id) : undefined;
    if (!sub || !chapter) continue;
    const idx = note.content.toLowerCase().indexOf(trimmed.toLowerCase());
    const start = Math.max(0, idx - 40);
    const snippet = `${start > 0 ? "…" : ""}${note.content.slice(start, start + 120)}${note.content.length > start + 120 ? "…" : ""}`;
    results.push({
      subEntityId: sub.id,
      subEntityName: sub.name,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      bookTitle: bookTitleById.get(chapter.book_id) ?? "",
      snippet,
    });
  }
  return results;
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
