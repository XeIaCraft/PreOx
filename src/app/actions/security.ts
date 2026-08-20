"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireUser } from "@/lib/auth/dal";

export interface ActionState {
  error?: string;
  success?: string;
}

export interface MySession {
  id: string;
  createdAt: string;
  updatedAt: string;
  userAgent: string | null;
  ip: string | null;
  isCurrent: boolean;
}

export async function listMySessions(): Promise<MySession[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_my_sessions");
  if (error || !data) return [];
  return data.map((s) => ({ id: s.id, createdAt: s.created_at, updatedAt: s.updated_at, userAgent: s.user_agent, ip: s.ip, isCurrent: s.is_current }));
}

export async function revokeMySession(sessionId: string): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_my_session", { target_session_id: sessionId });
  if (error) return { error: "Impossible de révoquer cette session." };

  revalidatePath("/profile");
  return { success: "Session révoquée." };
}

export interface LoginHistoryEntry {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
}

export async function listMyLoginHistory(): Promise<LoginHistoryEntry[]> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_login_log")
    .select("id, user_agent, ip, created_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(25);
  return (data ?? []).map((r) => ({ id: r.id, userAgent: r.user_agent, ip: r.ip, createdAt: r.created_at }));
}

/**
 * Self-service account deletion (GDPR "right to erasure"). Requires the
 * caller's own verified session — never accepts a target id from the
 * client — then uses the Admin API (the only way to delete an auth.users
 * row) to remove the account. `profiles` and every per-module row cascade
 * via their `on delete cascade` foreign keys, so nothing needs to be
 * cleaned up manually here.
 */
export async function deleteMyAccount(): Promise<ActionState> {
  const profile = await requireProfile();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(profile.id);
  if (error) return { error: "Impossible de supprimer le compte pour le moment." };

  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
