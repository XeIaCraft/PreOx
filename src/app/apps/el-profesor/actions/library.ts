"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { deleteChapterPdf, downloadChapterPdfBytes, uploadPublicImage } from "@/lib/el-profesor/storage";
import { extractDocxText, extractPptxText } from "@/lib/el-profesor/office-text";
import { getPdfPageCount } from "@/lib/el-profesor/pdf-split";
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

  let publicUrl: string;
  try {
    publicUrl = await uploadPublicImage("el-profesor-covers", path, bytes, mimeType);
  } catch (err) {
    // Surface the real Supabase Storage error (bucket missing, RLS denial,
    // payload rejected...) instead of a generic message that hid the
    // actual cause and made this near-impossible to diagnose remotely.
    return { error: err instanceof GeminiError ? err.message : "Échec de l'envoi de l'image." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_books").update({ cover_url: publicUrl }).eq("id", bookId);
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
 * PDF chapter import — split out from uploadChapter (2026-08-24) because a
 * real chapter PDF can run to 100+ MB and a Server Action argument can't
 * carry that (Next.js's own body size limit, and beyond a point Vercel's
 * platform-level request body cap regardless of what Next.js allows). The
 * browser uploads the PDF directly to storage via a signed upload URL
 * *before* calling this (see actions/pdf-upload.ts +
 * lib/el-profesor/client-pdf-upload.ts) — `storagePath` is that upload's
 * final location (`${bookId}/${chapterId}.pdf`), already the chapter's
 * permanent PDF, so this only has to record it and read its page count.
 */
export async function uploadChapterFromPdfPath(
  bookId: string,
  title: string,
  orderIndex: number,
  chapterId: string,
  storagePath: string
): Promise<ActionState & { chapterId?: string }> {
  await requireElProfesorAdmin();

  if (!title.trim()) return { error: "Le titre du chapitre est obligatoire." };

  let bytes: Uint8Array;
  try {
    bytes = await downloadChapterPdfBytes(storagePath);
  } catch {
    return { error: "PDF illisible ou introuvable dans le stockage." };
  }
  // Best-effort — a page count read failure shouldn't block the upload,
  // it just leaves per-page cost estimation unavailable for this chapter.
  const pageCount = await getPdfPageCount(bytes).catch(() => null);

  const supabase = await createClient();
  const { error } = await supabase.from("el_profesor_chapters").insert({
    id: chapterId,
    book_id: bookId,
    title: title.trim(),
    order_index: orderIndex,
    pdf_storage_path: storagePath,
    pdf_page_count: pageCount,
    source_kind: "pdf",
    status: "pending",
  });
  if (error) {
    await deleteChapterPdf(storagePath);
    return { error: "Impossible d'enregistrer le chapitre." };
  }

  revalidatePath("/apps/el-profesor");
  return { success: "Chapitre importé. Lancez l'extraction quand vous êtes prêt.", chapterId };
}

/** Word/PowerPoint chapter import — small enough (unlike a PDF) to pass directly as a Server Action argument. */
export async function uploadChapterFromOfficeFile(bookId: string, title: string, orderIndex: number, file: File): Promise<ActionState & { chapterId?: string }> {
  await requireElProfesorAdmin();

  if (!title.trim()) return { error: "Le titre du chapitre est obligatoire." };
  if (file.type !== DOCX_MIME && file.type !== PPTX_MIME) return { error: "Le fichier doit être un .docx ou un .pptx." };

  const chapterId = randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sourceKind = file.type === DOCX_MIME ? "docx" : "pptx";
  let sourceText: string;
  try {
    sourceText = sourceKind === "docx" ? await extractDocxText(bytes) : await extractPptxText(bytes);
  } catch (err) {
    return { error: err instanceof GeminiError ? err.message : "Échec de la lecture du fichier." };
  }

  const supabase = await createClient();
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
