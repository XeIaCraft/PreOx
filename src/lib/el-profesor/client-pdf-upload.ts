"use client";

import { createClient } from "@/lib/supabase/client";
import { EL_PROFESOR_PDF_BUCKET } from "./storage-constants";
import { createPdfUploadTarget } from "@/app/apps/el-profesor/actions/pdf-upload";

/**
 * Uploads a PDF directly from the browser to Supabase Storage via a signed
 * upload URL — see the doc comment on createPdfUploadTarget for why (large
 * book PDFs sent as a Server Action argument hit both Next.js's own body
 * size limit and, for genuinely large files, Vercel's platform-level
 * request body cap; this path avoids both since the bytes never transit
 * through a Server Action at all).
 */
export async function uploadPdfDirect(path: string, file: File): Promise<{ path: string } | { error: string }> {
  const target = await createPdfUploadTarget(path);
  if ("error" in target) return target;
  const supabase = createClient();
  const { error } = await supabase.storage.from(EL_PROFESOR_PDF_BUCKET).uploadToSignedUrl(target.path, target.token, file);
  if (error) return { error: `Échec de l'envoi du PDF : ${error.message}` };
  return { path: target.path };
}
