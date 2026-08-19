import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { GeminiError } from "@/lib/gemini-shared";

const BUCKET = "el-profesor-pdfs";
const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * The bucket carries no storage.objects policy for authenticated/anon (see
 * the migration) — every access goes through the service-role client here,
 * after the caller has already checked module access / admin role.
 */
export async function uploadChapterPdf(bookId: string, chapterId: string, bytes: Uint8Array): Promise<string> {
  const path = `${bookId}/${chapterId}.pdf`;
  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    throw new GeminiError(`Échec de l'envoi du PDF vers le stockage : ${error.message}`);
  }
  return path;
}

export async function getChapterPdfSignedUrl(path: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new GeminiError(`Impossible de générer l'URL du PDF : ${error?.message ?? "erreur inconnue"}`);
  }
  return data.signedUrl;
}

export async function downloadChapterPdfBytes(path: string): Promise<Uint8Array> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new GeminiError(`Impossible de lire le PDF depuis le stockage : ${error?.message ?? "erreur inconnue"}`);
  }
  return new Uint8Array(await data.arrayBuffer());
}

export async function deleteChapterPdf(path: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase.storage.from(BUCKET).remove([path]);
}
