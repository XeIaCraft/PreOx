"use server";

import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export interface ExportedFlashcard {
  front: string;
  back: string;
  page: number | null;
}

/** Published flashcards for a chapter, flattened for CSV/Anki-style export. */
export async function getChapterFlashcardsForExport(chapterId: string): Promise<ExportedFlashcard[] | { error: string }> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: subEntities } = await supabase.from("el_profesor_sub_entities").select("id").eq("chapter_id", chapterId);
  const subEntityIds = (subEntities ?? []).map((s) => s.id);
  if (subEntityIds.length === 0) return [];

  const { data: fiches } = await supabase
    .from("el_profesor_fiches")
    .select("id")
    .in("sub_entity_id", subEntityIds)
    .eq("status", "published");
  const ficheIds = (fiches ?? []).map((f) => f.id);
  if (ficheIds.length === 0) return [];

  const { data: flashcards, error } = await supabase
    .from("el_profesor_flashcards")
    .select("front, back, citations")
    .in("fiche_id", ficheIds)
    .eq("status", "published");
  if (error) return { error: "Impossible de récupérer les flashcards." };

  return (flashcards ?? []).map((card) => {
    const front = card.front as unknown as { text: string };
    const back = card.back as unknown as { text: string };
    const citations = (card.citations as unknown as { page: number }[]) ?? [];
    return { front: front.text, back: back.text, page: citations[0]?.page ?? null };
  });
}
