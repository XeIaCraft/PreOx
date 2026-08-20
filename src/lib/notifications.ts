import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";

/**
 * Creates an in-app notification for a user, and — if they've opted into
 * push and have at least one subscribed device — also sends a push
 * notification. Uses the service-role client because notifications are
 * system-generated (there's deliberately no client insert policy on the
 * table, see the migration). Never throws — a broken notification must
 * never break the flow that triggered it.
 */
export async function notifyUser(userId: string, title: string, body?: string, link?: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("notifications").insert({ user_id: userId, title, body: body ?? null, link: link ?? null });

    const { data: profile } = await admin.from("profiles").select("notify_push").eq("id", userId).maybeSingle();
    if (profile?.notify_push) {
      await sendPushToUser(userId, { title, body, link });
    }
  } catch (err) {
    console.error("notifyUser failed:", err);
  }
}
