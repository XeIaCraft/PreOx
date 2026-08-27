import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { GeminiError } from "@/lib/gemini-shared";
import { EL_PROFESOR_PDF_BUCKET as BUCKET } from "./storage-constants";

const SIGNED_URL_TTL_SECONDS = 60 * 10;

/**
 * Shared upload path for the module's public image buckets (book covers,
 * flashcard images) — both rely on a storage.objects RLS policy gating
 * writes to admins (`is_admin()`), unlike the PDF bucket above which has no
 * public policy at all and always goes through the service-role client.
 */
export async function uploadPublicImage(bucket: string, path: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: mimeType, upsert: true });
  // Unprefixed — callers add their own "Échec de l'envoi de l'image : "
  // context, and also apply the same prefix to an outright thrown
  // exception from the storage client itself (not this { error } path),
  // so keeping it here would double it for one of the two cases.
  if (error) throw new GeminiError(error.message);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

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
