import "server-only";

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Web Push. Requires VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (generate once
 * with `npx web-push generate-vapid-keys`, see .env.local.example) — until
 * those are set this silently no-ops, same non-blocking pattern as email.
 */
function configure(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("push: VAPID keys not configured, skipping push send.");
    return false;
  }
  webpush.setVapidDetails("mailto:contact@preox.app", publicKey, privateKey);
  return true;
}

export async function sendPushToUser(userId: string, payload: { title: string; body?: string; link?: string }): Promise<void> {
  if (!configure()) return;

  const admin = createAdminClient();
  const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err) {
        // 410/404 means the subscription is dead (browser data cleared, uninstalled…) — clean it up.
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        } else {
          console.error("sendPushToUser failed:", err);
        }
      }
    })
  );
}
