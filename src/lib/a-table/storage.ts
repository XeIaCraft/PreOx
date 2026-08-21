import "server-only";

import { createClient } from "@/lib/supabase/server";

const BUCKET = "a-table-recipe-photos";
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

/**
 * Uploads via the authenticated (RLS-backed) client, not the service-role
 * client — storage.objects policies restrict writes to the caller's own
 * folder (see the migration), so ownership is enforced by Postgres, not
 * just by the caller having already checked it.
 */
async function uploadPhoto(userId: string, pathPrefix: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new Error("Photo trop lourde (8 Mo maximum).");
  }
  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${userId}/${pathPrefix}-${Date.now()}.${ext}`;

  const supabase = await createClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error("Échec de l'envoi de la photo.");

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function uploadRecipePhoto(userId: string, recipeId: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  return uploadPhoto(userId, recipeId, bytes, mimeType);
}

/** Photo diary — a snapshot of the finished dish attached to a history entry, same bucket as recipe photos. */
export function uploadHistoryPhoto(userId: string, historyId: string, bytes: Uint8Array, mimeType: string): Promise<string> {
  return uploadPhoto(userId, `history-${historyId}`, bytes, mimeType);
}
