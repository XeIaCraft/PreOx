"use server";

import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import { EL_PROFESOR_PDF_BUCKET } from "@/lib/el-profesor/storage-constants";

export interface PdfUploadTarget {
  path: string;
  token: string;
}

/**
 * Generates a one-time signed upload target for the PDF storage bucket, so
 * the browser can upload a book/chapter PDF directly to Supabase Storage —
 * bypassing the Next.js Server Action body size limit (and any platform-
 * level request body cap) entirely, since the file bytes never pass
 * through a Server Action request at all. Added 2026-08-24 after "Diviser
 * un PDF" and single-chapter PDF import kept failing on real book-sized
 * PDFs (100+ MB) sent as a direct Server Action argument.
 *
 * `path` is caller-chosen: pass the final chapter storage path
 * (`${bookId}/${chapterId}.pdf`) directly for a single-chapter upload —
 * no extra copy needed afterward — or a throwaway `_staging/` path for a
 * whole-book upload that gets split into per-chapter files and deleted
 * once processed.
 */
export async function createPdfUploadTarget(path: string): Promise<{ error: string } | PdfUploadTarget> {
  await requireElProfesorAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(EL_PROFESOR_PDF_BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: "Impossible de préparer l'envoi du PDF." };
  return { path: data.path, token: data.token };
}
