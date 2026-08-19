"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadChapterPdf as uploadPdfBytes, deleteChapterPdf } from "@/lib/el-profesor/storage";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function createBook(input: { title: string; author?: string; edition?: string }): Promise<ActionState & { bookId?: string }> {
  const profile = await requireElProfesorAdmin();
  if (!input.title.trim()) return { error: "Le titre du livre est obligatoire." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("el_profesor_books")
    .insert({
      title: input.title.trim(),
      author: input.author?.trim() || null,
      edition: input.edition?.trim() || null,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Impossible de créer le livre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Livre créé.", bookId: data.id };
}

export async function deleteBook(bookId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("pdf_storage_path").eq("book_id", bookId);
  await Promise.all((chapters ?? []).map((c) => deleteChapterPdf(c.pdf_storage_path)));

  const { error } = await supabase.from("el_profesor_books").delete().eq("id", bookId);
  if (error) return { error: "Impossible de supprimer le livre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Livre supprimé." };
}

export async function uploadChapter(
  bookId: string,
  title: string,
  orderIndex: number,
  file: File
): Promise<ActionState & { chapterId?: string }> {
  await requireElProfesorAdmin();

  if (!title.trim()) return { error: "Le titre du chapitre est obligatoire." };
  if (file.type !== "application/pdf") return { error: "Le fichier doit être un PDF." };

  const chapterId = randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());

  let storagePath: string;
  try {
    storagePath = await uploadPdfBytes(bookId, chapterId, bytes);
  } catch {
    return { error: "Échec de l'envoi du PDF." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_chapters").insert({
    id: chapterId,
    book_id: bookId,
    title: title.trim(),
    order_index: orderIndex,
    pdf_storage_path: storagePath,
    status: "pending",
  });

  if (error) {
    await deleteChapterPdf(storagePath);
    return { error: "Impossible d'enregistrer le chapitre." };
  }

  revalidatePath("/apps/el-profesor");
  return { success: "Chapitre importé. Lancez l'extraction quand vous êtes prêt.", chapterId };
}

export async function deleteChapter(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("pdf_storage_path").eq("id", chapterId).single();
  if (chapter) await deleteChapterPdf(chapter.pdf_storage_path);

  const { error } = await supabase.from("el_profesor_chapters").delete().eq("id", chapterId);
  if (error) return { error: "Impossible de supprimer le chapitre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Chapitre supprimé." };
}
