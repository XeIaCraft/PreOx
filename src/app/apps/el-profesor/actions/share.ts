"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ActionState {
  error?: string;
  success?: string;
}

/**
 * Toggles a public, read-only share link for a published fiche. Any user
 * with module access may share a fiche they can already see — sharing
 * doesn't require admin rights, but `el_profesor_fiches` itself is
 * admin-write-only RLS (shared content, not personal data), so this uses
 * the service-role client for the single scoped update, same pattern as
 * `proposeFromSelection`.
 */
export async function toggleFicheShare(ficheId: string, share: boolean): Promise<ActionState & { shareToken?: string | null }> {
  await requireElProfesorAccess();
  const supabase = await createClient();

  const { data: fiche } = await supabase.from("el_profesor_fiches").select("status").eq("id", ficheId).maybeSingle();
  if (!fiche || fiche.status !== "published") return { error: "Seules les fiches publiées peuvent être partagées." };

  const shareToken = share ? randomUUID() : null;
  const admin = createAdminClient();
  const { error } = await admin.from("el_profesor_fiches").update({ share_token: shareToken }).eq("id", ficheId);
  if (error) return { error: "Impossible de mettre à jour le partage." };

  revalidatePath("/apps/el-profesor");
  return { success: share ? "Lien de partage créé." : "Partage désactivé.", shareToken };
}
