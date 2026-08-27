"use client";

import { createClient } from "@/lib/supabase/client";
import { createImageUploadTarget, type PublicImageBucket } from "@/app/apps/el-profesor/actions/image-upload";

/**
 * Uploads an image directly from the browser to Supabase Storage via a
 * signed upload URL — see createImageUploadTarget's doc comment for why
 * (base64-in-a-Server-Action hits Vercel's platform-level request body cap
 * well before Next's own configured limit). Returns the bucket's public
 * URL, ready to hand to the (now record-only) Server Action.
 */
export async function uploadImageDirect(
  bucket: PublicImageBucket,
  path: string,
  file: File | Blob,
  contentType: string
): Promise<{ url: string } | { error: string }> {
  const target = await createImageUploadTarget(bucket, path);
  if ("error" in target) return target;
  const supabase = createClient();
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(target.path, target.token, file, { contentType });
  if (error) return { error: `Échec de l'envoi de l'image : ${error.message}` };
  const { data } = supabase.storage.from(bucket).getPublicUrl(target.path);
  return { url: data.publicUrl };
}
