"use server";

import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EL_PROFESOR_BLOCK_IMAGE_BUCKET,
  EL_PROFESOR_COVER_BUCKET,
  EL_PROFESOR_FLASHCARD_IMAGE_BUCKET,
} from "@/lib/el-profesor/storage-constants";

const PUBLIC_IMAGE_BUCKETS = [EL_PROFESOR_COVER_BUCKET, EL_PROFESOR_FLASHCARD_IMAGE_BUCKET, EL_PROFESOR_BLOCK_IMAGE_BUCKET] as const;
export type PublicImageBucket = (typeof PUBLIC_IMAGE_BUCKETS)[number];

export interface ImageUploadTarget {
  bucket: PublicImageBucket;
  path: string;
  token: string;
}

/**
 * Generates a one-time signed upload target for one of the module's public
 * image buckets, so the browser can upload directly to Supabase Storage —
 * bypassing the Next.js Server Action body size limit and, more importantly,
 * Vercel's platform-level request body cap for serverless functions
 * (~4.5 MB, and Next's own bodySizeLimit config cannot override it). Added
 * 2026-08-27: images were previously sent as base64 through a Server Action
 * argument (5 MB raw cap → ~6.7 MB encoded, already past that ceiling),
 * which failed before ever reaching the action's function body — surfacing
 * only as an opaque, redacted React error ("#441 — An error occurred in the
 * Server Components render") with no useful message no matter how much the
 * action's own error handling was improved. Same class of bug already fixed
 * for chapter PDF uploads (see createPdfUploadTarget), same fix.
 */
export async function createImageUploadTarget(bucket: PublicImageBucket, path: string): Promise<{ error: string } | ImageUploadTarget> {
  await requireElProfesorAdmin();
  if (!PUBLIC_IMAGE_BUCKETS.includes(bucket)) return { error: "Bucket d'image invalide." };
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return { error: "Impossible de préparer l'envoi de l'image." };
  return { bucket, path: data.path, token: data.token };
}
