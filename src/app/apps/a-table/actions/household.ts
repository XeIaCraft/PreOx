"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { requireATableAccess } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MemberDisplayPrefs } from "@/lib/a-table/types";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function addHouseholdMember(input: { name: string; allergies: string[]; diet: string }): Promise<ActionState> {
  const profile = await requireATableAccess();
  const name = input.name.trim();
  if (!name) return { error: "Le nom est requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("a_table_household_members").insert({
    user_id: profile.id,
    name,
    allergies: input.allergies,
    diet: input.diet.trim(),
  });

  if (error) return { error: "Impossible d'ajouter ce profil." };

  revalidatePath("/apps/a-table");
  return { success: "Profil ajouté." };
}

export async function updateHouseholdMember(id: string, input: { name: string; allergies: string[]; diet: string }): Promise<ActionState> {
  const profile = await requireATableAccess();
  const name = input.name.trim();
  if (!name) return { error: "Le nom est requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("a_table_household_members")
    .update({ name, allergies: input.allergies, diet: input.diet.trim() })
    .eq("id", id)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour ce profil." };

  revalidatePath("/apps/a-table");
  return { success: "Profil mis à jour." };
}

export async function removeHouseholdMember(id: string): Promise<ActionState> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const { error } = await supabase.from("a_table_household_members").delete().eq("id", id).eq("user_id", profile.id);

  if (error) return { error: "Impossible de supprimer ce profil." };

  revalidatePath("/apps/a-table");
  return { success: "" };
}

/** Owner-only: generates or revokes a member's personal page link — same opaque-token model as the other public links in this module. */
export async function toggleMemberAccess(memberId: string, enable: boolean): Promise<ActionState & { token?: string | null }> {
  const profile = await requireATableAccess();
  const supabase = await createClient();

  const token = enable ? randomUUID() : null;
  const { error } = await supabase
    .from("a_table_household_members")
    .update({ access_token: token })
    .eq("id", memberId)
    .eq("user_id", profile.id);

  if (error) return { error: "Impossible de mettre à jour ce lien." };

  revalidatePath("/apps/a-table");
  return { success: enable ? "Lien personnel créé." : "Lien personnel désactivé.", token };
}

/**
 * Public, unauthenticated: a household member updates their own display
 * preferences (theme/density) — the only thing their personal link lets
 * them change, everything else on that page is read-only.
 */
export async function updateMemberDisplayPrefs(token: string, prefs: MemberDisplayPrefs): Promise<ActionState> {
  if (!token) return { error: "Lien invalide." };

  const supabase = createAdminClient();
  const { data: member } = await supabase.from("a_table_household_members").select("id").eq("access_token", token).maybeSingle();
  if (!member) return { error: "Ce lien n'est plus valide." };

  const { error } = await supabase.from("a_table_household_members").update({ display_prefs: prefs }).eq("id", member.id);
  if (error) return { error: "Impossible d'enregistrer vos préférences." };

  return { success: "" };
}
