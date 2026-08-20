"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function updateAccentTheme(accent: "forest" | "slate"): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ accent_theme: accent }).eq("id", profile.id);
  if (error) return { error: "Impossible de mettre à jour le thème." };
  return { success: "" };
}

export async function updateDensity(density: "comfortable" | "compact"): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ density }).eq("id", profile.id);
  if (error) return { error: "Impossible de mettre à jour la densité." };
  return { success: "" };
}

export async function updateAppOrder(order: string[]): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ app_order: order }).eq("id", profile.id);
  if (error) return { error: "Impossible d'enregistrer l'ordre." };
  revalidatePath("/apps");
  return { success: "" };
}

export async function setWidgetHidden(widget: string, hidden: boolean): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const next = hidden ? [...new Set([...profile.hidden_widgets, widget])] : profile.hidden_widgets.filter((w) => w !== widget);
  const { error } = await supabase.from("profiles").update({ hidden_widgets: next }).eq("id", profile.id);
  if (error) return { error: "Impossible de mettre à jour l'affichage." };
  revalidatePath("/apps");
  return { success: "" };
}
