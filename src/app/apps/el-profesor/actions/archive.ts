"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Full content export of a book (every chapter/sub-entity/fiche/block/
 * flashcard, any status) plus anonymized aggregate review stats — no
 * user_id anywhere in the output, only counts. Meant to be downloaded right
 * before archiving. Item 49 of the backlog.
 */
export async function exportBookArchive(bookId: string): Promise<{ content: string } | { error: string }> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: book } = await supabase.from("el_profesor_books").select("*").eq("id", bookId).maybeSingle();
  if (!book) return { error: "Livre introuvable." };

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("*").eq("book_id", bookId).order("order_index");
  const chapterIds = (chapters ?? []).map((c) => c.id);

  const { data: subEntities } = chapterIds.length
    ? await supabase.from("el_profesor_sub_entities").select("*").in("chapter_id", chapterIds).order("order_index")
    : { data: [] };
  const subEntityIds = (subEntities ?? []).map((s) => s.id);

  const { data: fiches } = subEntityIds.length
    ? await supabase.from("el_profesor_fiches").select("*").in("sub_entity_id", subEntityIds)
    : { data: [] };
  const ficheIds = (fiches ?? []).map((f) => f.id);

  const [{ data: blocks }, { data: flashcards }] = ficheIds.length
    ? await Promise.all([
        supabase.from("el_profesor_fiche_blocks").select("*").in("fiche_id", ficheIds).order("order_index"),
        supabase.from("el_profesor_flashcards").select("*").in("fiche_id", ficheIds),
      ])
    : [{ data: [] }, { data: [] }];

  const flashcardIds = (flashcards ?? []).map((c) => c.id);
  let stats = { totalFlashcards: flashcardIds.length, totalReviewLogEntries: 0, distinctUsersEngaged: 0, masteredByAtLeastOneUser: 0 };
  if (flashcardIds.length > 0) {
    const [{ count: logCount }, { data: states }] = await Promise.all([
      supabase.from("el_profesor_review_log").select("id", { count: "exact", head: true }).in("flashcard_id", flashcardIds),
      supabase.from("el_profesor_review_state").select("user_id, flashcard_id, state").in("flashcard_id", flashcardIds),
    ]);
    const users = new Set((states ?? []).map((s) => s.user_id));
    const masteredCards = new Set((states ?? []).filter((s) => s.state === "review").map((s) => s.flashcard_id));
    stats = {
      totalFlashcards: flashcardIds.length,
      totalReviewLogEntries: logCount ?? 0,
      distinctUsersEngaged: users.size,
      masteredByAtLeastOneUser: masteredCards.size,
    };
  }

  const archive = {
    exportedAt: new Date().toISOString(),
    book: { title: book.title, author: book.author, edition: book.edition, theme: book.theme },
    stats,
    chapters: (chapters ?? []).map((chapter) => ({
      title: chapter.title,
      status: chapter.status,
      subEntities: (subEntities ?? [])
        .filter((s) => s.chapter_id === chapter.id)
        .map((sub) => {
          const fiche = (fiches ?? []).find((f) => f.sub_entity_id === sub.id);
          return {
            name: sub.name,
            summary: sub.summary,
            fiche: fiche
              ? {
                  title: fiche.title,
                  status: fiche.status,
                  blocks: (blocks ?? [])
                    .filter((b) => b.fiche_id === fiche.id)
                    .map((b) => ({ blockType: b.block_type, content: b.content, citations: b.citations })),
                  flashcards: (flashcards ?? [])
                    .filter((c) => c.fiche_id === fiche.id)
                    .map((c) => ({ front: c.front, back: c.back, citations: c.citations })),
                }
              : null,
          };
        }),
    })),
  };

  return { content: JSON.stringify(archive, null, 2) };
}

/** Soft-archives a book — removes it from the active library without deleting anything, reversible via unarchiveBook. */
export async function archiveBook(bookId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_books").update({ archived_at: new Date().toISOString() }).eq("id", bookId);
  if (error) return { error: "Impossible d'archiver ce livre." };
  revalidatePath("/apps/el-profesor");
  return { success: "Livre archivé." };
}

export async function unarchiveBook(bookId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_books").update({ archived_at: null }).eq("id", bookId);
  if (error) return { error: "Impossible de réactiver ce livre." };
  revalidatePath("/apps/el-profesor");
  return { success: "Livre réactivé." };
}
