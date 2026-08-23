"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { uploadChapterPdf as uploadPdfBytes, deleteChapterPdf } from "@/lib/el-profesor/storage";
import { extractDocxText, extractPptxText } from "@/lib/el-profesor/office-text";
import { GeminiError } from "@/lib/gemini-shared";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function createBook(
  input: { title: string; author?: string; edition?: string; theme?: string }
): Promise<ActionState & { bookId?: string }> {
  const profile = await requireElProfesorAdmin();
  if (!input.title.trim()) return { error: "Le titre du livre est obligatoire." };

  const supabase = await createClient();
  const { count } = await supabase.from("el_profesor_books").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("el_profesor_books")
    .insert({
      title: input.title.trim(),
      author: input.author?.trim() || null,
      edition: input.edition?.trim() || null,
      theme: input.theme?.trim() || null,
      order_index: count ?? 0,
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Impossible de créer le livre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Livre créé.", bookId: data.id };
}

/**
 * New edition of an existing book (item 6 of the backlog): creates a fresh,
 * empty book chained to the old one via previous_edition_book_id, then
 * archives the old one — reversible (unarchiveBook) and nothing is deleted,
 * so the old edition's content stays available as history. Chapters aren't
 * copied: a new edition typically reorganizes/renumbers chapters, so
 * carrying stale ones over would just mean deleting them by hand anyway —
 * re-uploading is simpler and safer than a heuristic auto-copy.
 */
export async function createNewEditionOfBook(
  oldBookId: string,
  input: { title: string; author?: string; edition?: string; theme?: string }
): Promise<ActionState & { bookId?: string }> {
  const profile = await requireElProfesorAdmin();
  if (!input.title.trim()) return { error: "Le titre du livre est obligatoire." };

  const supabase = await createClient();
  const { data: oldBook } = await supabase.from("el_profesor_books").select("id").eq("id", oldBookId).maybeSingle();
  if (!oldBook) return { error: "Livre d'origine introuvable." };

  const { count } = await supabase.from("el_profesor_books").select("id", { count: "exact", head: true });

  const { data, error } = await supabase
    .from("el_profesor_books")
    .insert({
      title: input.title.trim(),
      author: input.author?.trim() || null,
      edition: input.edition?.trim() || null,
      theme: input.theme?.trim() || null,
      order_index: count ?? 0,
      created_by: profile.id,
      previous_edition_book_id: oldBookId,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "Impossible de créer la nouvelle édition." };

  await supabase.from("el_profesor_books").update({ archived_at: new Date().toISOString() }).eq("id", oldBookId);

  revalidatePath("/apps/el-profesor");
  return { success: "Nouvelle édition créée, l'ancienne a été archivée.", bookId: data.id };
}

/** Swaps this book's order_index with the previous/next book, admin-only reordering on the dashboard. */
export async function moveBook(bookId: string, direction: "up" | "down"): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: books } = await supabase.from("el_profesor_books").select("id, order_index").order("order_index", { ascending: true });
  const list = books ?? [];
  const index = list.findIndex((b) => b.id === bookId);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
    return { success: "OK" };
  }

  const target = list[targetIndex];
  const current = list[index];
  const [error1, error2] = await Promise.all([
    supabase.from("el_profesor_books").update({ order_index: target.order_index }).eq("id", current.id).then((r) => r.error),
    supabase.from("el_profesor_books").update({ order_index: current.order_index }).eq("id", target.id).then((r) => r.error),
  ]);
  if (error1 || error2) return { error: "Impossible de réordonner ce livre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Livre déplacé." };
}

const MAX_COVER_BYTES = 5 * 1024 * 1024;

export async function uploadBookCover(bookId: string, imageBase64: string, mimeType: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.byteLength > MAX_COVER_BYTES) return { error: "Image trop lourde (5 Mo maximum)." };

  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${bookId}.${ext}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage.from("el-profesor-covers").upload(path, bytes, { contentType: mimeType, upsert: true });
  if (uploadError) return { error: "Échec de l'envoi de l'image." };

  const { data: pub } = supabase.storage.from("el-profesor-covers").getPublicUrl(path);
  const { error } = await supabase.from("el_profesor_books").update({ cover_url: pub.publicUrl }).eq("id", bookId);
  if (error) return { error: "Image envoyée, mais impossible de l'enregistrer." };

  revalidatePath("/apps/el-profesor");
  return { success: "Couverture mise à jour." };
}

export async function updateBook(
  bookId: string,
  input: { title: string; author?: string; edition?: string; theme?: string }
): Promise<ActionState> {
  await requireElProfesorAdmin();
  if (!input.title.trim()) return { error: "Le titre du livre est obligatoire." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("el_profesor_books")
    .update({
      title: input.title.trim(),
      author: input.author?.trim() || null,
      edition: input.edition?.trim() || null,
      theme: input.theme?.trim() || null,
    })
    .eq("id", bookId);
  if (error) return { error: "Impossible de mettre à jour le livre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Livre mis à jour." };
}

export async function deleteBook(bookId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapters } = await supabase.from("el_profesor_chapters").select("pdf_storage_path").eq("book_id", bookId);
  await Promise.all((chapters ?? []).filter((c) => c.pdf_storage_path).map((c) => deleteChapterPdf(c.pdf_storage_path!)));

  const { error } = await supabase.from("el_profesor_books").delete().eq("id", bookId);
  if (error) return { error: "Impossible de supprimer le livre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Livre supprimé." };
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

/**
 * Accepts a PDF (the normal, fully-featured path: real pages, citation
 * ground-truth, PDF viewer) or a Word/PowerPoint file (item 5 of the
 * backlog: plain text extracted up front and stored on the chapter row
 * itself — there's no binary to keep, no page position to cite, and no
 * verification pass against a source document later).
 */
export async function uploadChapter(
  bookId: string,
  title: string,
  orderIndex: number,
  file: File
): Promise<ActionState & { chapterId?: string }> {
  await requireElProfesorAdmin();

  if (!title.trim()) return { error: "Le titre du chapitre est obligatoire." };

  const chapterId = randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const supabase = await createClient();

  if (file.type === "application/pdf") {
    let storagePath: string;
    try {
      storagePath = await uploadPdfBytes(bookId, chapterId, bytes);
    } catch {
      return { error: "Échec de l'envoi du PDF." };
    }

    const { error } = await supabase.from("el_profesor_chapters").insert({
      id: chapterId,
      book_id: bookId,
      title: title.trim(),
      order_index: orderIndex,
      pdf_storage_path: storagePath,
      source_kind: "pdf",
      status: "pending",
    });
    if (error) {
      await deleteChapterPdf(storagePath);
      return { error: "Impossible d'enregistrer le chapitre." };
    }
  } else if (file.type === DOCX_MIME || file.type === PPTX_MIME) {
    const sourceKind = file.type === DOCX_MIME ? "docx" : "pptx";
    let sourceText: string;
    try {
      sourceText = sourceKind === "docx" ? await extractDocxText(bytes) : await extractPptxText(bytes);
    } catch (err) {
      return { error: err instanceof GeminiError ? err.message : "Échec de la lecture du fichier." };
    }

    const { error } = await supabase.from("el_profesor_chapters").insert({
      id: chapterId,
      book_id: bookId,
      title: title.trim(),
      order_index: orderIndex,
      pdf_storage_path: null,
      source_kind: sourceKind,
      source_text: sourceText,
      status: "pending",
    });
    if (error) return { error: "Impossible d'enregistrer le chapitre." };
  } else {
    return { error: "Le fichier doit être un PDF, un .docx ou un .pptx." };
  }

  revalidatePath("/apps/el-profesor");
  return { success: "Chapitre importé. Lancez l'extraction quand vous êtes prêt.", chapterId };
}

export async function deleteChapter(chapterId: string): Promise<ActionState> {
  await requireElProfesorAdmin();
  const supabase = await createClient();

  const { data: chapter } = await supabase.from("el_profesor_chapters").select("pdf_storage_path").eq("id", chapterId).single();
  if (chapter?.pdf_storage_path) await deleteChapterPdf(chapter.pdf_storage_path);

  const { error } = await supabase.from("el_profesor_chapters").delete().eq("id", chapterId);
  if (error) return { error: "Impossible de supprimer le chapitre." };

  revalidatePath("/apps/el-profesor");
  return { success: "Chapitre supprimé." };
}
