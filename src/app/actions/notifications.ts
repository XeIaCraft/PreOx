"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/supabase/types";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function listMyNotifications(): Promise<NotificationRow[]> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(30);
  return data ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read: true }).eq("id", id).eq("user_id", profile.id);
  revalidatePath("/apps");
}

export async function markAllNotificationsRead(): Promise<void> {
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase.from("notifications").update({ read: true }).eq("user_id", profile.id).eq("read", false);
  revalidatePath("/apps");
}

export async function updateNotificationPrefs(prefs: { notifyEmailDigest?: boolean; notifyPush?: boolean }): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const update: { notify_email_digest?: boolean; notify_push?: boolean } = {};
  if (prefs.notifyEmailDigest !== undefined) update.notify_email_digest = prefs.notifyEmailDigest;
  if (prefs.notifyPush !== undefined) update.notify_push = prefs.notifyPush;

  const { error } = await supabase.from("profiles").update(update).eq("id", profile.id);
  if (error) return { error: "Impossible de mettre à jour vos préférences." };

  revalidatePath("/profile");
  return { success: "Préférences mises à jour." };
}

export async function subscribeToPush(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: profile.id, endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    { onConflict: "endpoint" }
  );
  if (error) return { error: "Impossible d'activer les notifications push." };

  await supabase.from("profiles").update({ notify_push: true }).eq("id", profile.id);
  revalidatePath("/profile");
  return { success: "Notifications push activées." };
}

export async function unsubscribeFromPush(endpoint: string): Promise<ActionState> {
  const profile = await requireProfile();
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", profile.id);
  await supabase.from("profiles").update({ notify_push: false }).eq("id", profile.id);
  revalidatePath("/profile");
  return { success: "Notifications push désactivées." };
}
