"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

/** RGPD-style export: every row across both modules that belongs to the current user, as one JSON document. */
export async function exportMyData(): Promise<{ error?: string; json?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [
    recipes,
    mealCards,
    history,
    guestMenus,
    temporaryIngredients,
    collections,
    aTableSettings,
    reviewState,
    reviewLog,
    bookmarks,
    notes,
  ] = await Promise.all([
    supabase.from("a_table_recipes").select("*").eq("user_id", profile.id),
    supabase.from("a_table_meal_cards").select("*").eq("user_id", profile.id),
    supabase.from("a_table_history").select("*").eq("user_id", profile.id),
    supabase.from("a_table_guest_menus").select("*").eq("user_id", profile.id),
    supabase.from("a_table_temporary_ingredients").select("*").eq("user_id", profile.id),
    supabase.from("a_table_collections").select("*").eq("user_id", profile.id),
    supabase
      .from("a_table_settings")
      .select("preferences, generation_rules, shopping_list_checked, shopping_list_manual_items")
      .eq("user_id", profile.id)
      .maybeSingle(),
    supabase.from("el_profesor_review_state").select("*").eq("user_id", profile.id),
    supabase.from("el_profesor_review_log").select("*").eq("user_id", profile.id),
    supabase.from("el_profesor_bookmarks").select("*").eq("user_id", profile.id),
    supabase.from("el_profesor_notes").select("*").eq("user_id", profile.id),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    profile: { full_name: profile.full_name, email: profile.email, created_at: profile.created_at },
    a_table: {
      recipes: recipes.data ?? [],
      meal_cards: mealCards.data ?? [],
      history: history.data ?? [],
      guest_menus: guestMenus.data ?? [],
      temporary_ingredients: temporaryIngredients.data ?? [],
      collections: collections.data ?? [],
      settings: aTableSettings.data ?? null,
    },
    el_profesor: {
      review_state: reviewState.data ?? [],
      review_log: reviewLog.data ?? [],
      bookmarks: bookmarks.data ?? [],
      notes: notes.data ?? [],
    },
  };

  return { json: JSON.stringify(payload, null, 2) };
}

/** Invalidates every refresh token for this user — every device, including the one making this request. */
export async function signOutAllDevices(): Promise<void> {
  await requireProfile();
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
