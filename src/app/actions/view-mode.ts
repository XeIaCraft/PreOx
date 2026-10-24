"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/dal";
import { VIEW_COOKIE, type ViewMode } from "@/lib/auth/view-mode";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

/** The switch inside a module: this device shows that view until the profile's default changes. Real admins only. */
export async function setViewMode(mode: ViewMode): Promise<ActionState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") return { error: "Réservé aux administrateurs." };
  (await cookies()).set(VIEW_COOKIE, mode, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  revalidatePath("/apps", "layout");
  return {};
}

/** « Mon profil » → the view the modules open in; the per-device switch is reset so it applies everywhere. */
export async function updateDefaultView(mode: ViewMode): Promise<ActionState> {
  const profile = await requireProfile();
  if (profile.role !== "admin") return { error: "Réservé aux administrateurs." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ default_view: mode }).eq("id", profile.id);
  if (error) return { error: "Impossible d'enregistrer la vue par défaut." };
  (await cookies()).delete(VIEW_COOKIE);
  revalidatePath("/apps", "layout");
  return { success: "" };
}
