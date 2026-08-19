"use server";

import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { getChapterPdfSignedUrl } from "@/lib/el-profesor/storage";

export async function getChapterPdfUrl(chapterId: string): Promise<{ url?: string; error?: string }> {
  await requireElProfesorAccess();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("pdf_storage_path").eq("id", chapterId).single();
  if (!chapter) return { error: "Chapitre introuvable." };

  try {
    const url = await getChapterPdfSignedUrl(chapter.pdf_storage_path);
    return { url };
  } catch {
    return { error: "Impossible de générer le lien vers le PDF." };
  }
}
