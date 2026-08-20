"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function createChangelogEntry(title: string, body: string, appId: string | null): Promise<ActionState> {
  const admin = await requireAdmin();
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle || !trimmedBody) return { error: "Le titre et le contenu sont requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("changelog_entries").insert({ title: trimmedTitle, body: trimmedBody, app_id: appId, created_by: admin.id });
  if (error) return { error: "Impossible de publier cette nouveauté." };

  await logActivity(admin.id, "publish_changelog", trimmedTitle);
  revalidatePath("/nouveautes");
  revalidatePath("/apps");
  revalidatePath("/admin/changelog");
  return { success: "Publié." };
}

export async function deleteChangelogEntry(id: string): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("changelog_entries").delete().eq("id", id);
  if (error) return { error: "Impossible de supprimer." };

  revalidatePath("/nouveautes");
  revalidatePath("/apps");
  revalidatePath("/admin/changelog");
  return { success: "Supprimé." };
}
