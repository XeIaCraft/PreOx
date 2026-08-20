"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity-log";
import { notifyUser } from "@/lib/notifications";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function createGroup(name: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom du groupe est requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("user_groups").insert({ name: trimmed });
  if (error) return { error: "Impossible de créer le groupe." };

  await logActivity(admin.id, "create_group", trimmed);
  revalidatePath("/admin/groups");
  return { success: "Groupe créé." };
}

export async function renameGroup(groupId: string, name: string): Promise<ActionState> {
  await requireAdmin();
  const trimmed = name.trim();
  if (!trimmed) return { error: "Le nom du groupe est requis." };

  const supabase = await createClient();
  const { error } = await supabase.from("user_groups").update({ name: trimmed }).eq("id", groupId);
  if (error) return { error: "Impossible de renommer le groupe." };

  revalidatePath("/admin/groups");
  revalidatePath(`/admin/groups/${groupId}`);
  return { success: "Groupe renommé." };
}

export async function deleteGroup(groupId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("user_groups").delete().eq("id", groupId);
  if (error) return { error: "Impossible de supprimer le groupe." };

  await logActivity(admin.id, "delete_group", groupId);
  revalidatePath("/admin/groups");
  return { success: "Groupe supprimé." };
}

export async function setGroupMember(groupId: string, userId: string, member: boolean): Promise<ActionState> {
  await requireAdmin();
  const supabase = await createClient();

  if (member) {
    const { error } = await supabase.from("user_group_members").upsert({ group_id: groupId, user_id: userId });
    if (error) return { error: "Impossible d'ajouter ce membre." };
  } else {
    const { error } = await supabase.from("user_group_members").delete().eq("group_id", groupId).eq("user_id", userId);
    if (error) return { error: "Impossible de retirer ce membre." };
  }

  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/apps");
  return { success: "Membres mis à jour." };
}

export async function setGroupAppAccess(groupId: string, appId: string, granted: boolean): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  if (granted) {
    const { error } = await supabase.from("user_group_app_access").upsert({ group_id: groupId, app_id: appId });
    if (error) return { error: "Impossible d'attribuer cet accès au groupe." };
  } else {
    const { error } = await supabase.from("user_group_app_access").delete().eq("group_id", groupId).eq("app_id", appId);
    if (error) return { error: "Impossible de retirer cet accès au groupe." };
  }

  await logActivity(admin.id, granted ? "grant_group_app_access" : "revoke_group_app_access", groupId, { appId });
  if (granted) {
    const [{ data: app }, { data: members }] = await Promise.all([
      supabase.from("apps").select("name, slug").eq("id", appId).single(),
      supabase.from("user_group_members").select("user_id").eq("group_id", groupId),
    ]);
    if (app) {
      await Promise.all((members ?? []).map((m) => notifyUser(m.user_id, `Nouveau module : ${app.name}`, "Vous y avez maintenant accès.", `/apps/${app.slug}`)));
    }
  }
  revalidatePath(`/admin/groups/${groupId}`);
  revalidatePath("/apps");
  return { success: "Accès du groupe mis à jour." };
}
