"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/dal";

export interface ActionState {
  error?: string;
  success?: string;
}

const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

export async function updateFullName(fullName: string): Promise<ActionState> {
  const profile = await requireProfile();
  const trimmed = fullName.trim();
  if (!trimmed) return { error: "Le nom ne peut pas être vide." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: trimmed }).eq("id", profile.id);
  if (error) return { error: "Impossible de mettre à jour votre nom." };

  revalidatePath("/profile");
  return { success: "Nom mis à jour." };
}

export async function uploadAvatar(imageBase64: string, mimeType: string): Promise<ActionState> {
  const profile = await requireProfile();
  const bytes = Buffer.from(imageBase64, "base64");
  if (bytes.byteLength > MAX_AVATAR_BYTES) return { error: "Image trop lourde (4 Mo maximum)." };

  const ext = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const path = `${profile.id}/avatar-${Date.now()}.${ext}`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: mimeType, upsert: true });
  if (uploadError) return { error: "Échec de l'envoi de la photo." };

  const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error } = await supabase.from("profiles").update({ avatar_url: pub.publicUrl }).eq("id", profile.id);
  if (error) return { error: "Photo envoyée, mais impossible de l'enregistrer." };

  revalidatePath("/profile");
  return { success: "Photo de profil mise à jour." };
}
