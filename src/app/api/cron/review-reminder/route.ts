import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";

export const maxDuration = 60;

/**
 * Evening push reminder for anyone with flashcards due today on El
 * Profesor — item 38 of the backlog ("notifications de révision"),
 * triggered by Vercel Cron (see vercel.json). Same CRON_SECRET check as
 * the other cron routes. Naturally skips anyone who already cleared their
 * queue earlier the same day, since the due count is computed live at
 * cron time rather than snapshotted at the start of the day. Push-only,
 * same pattern as defrost-reminder — sendPushToUser itself no-ops for a
 * user with no push_subscriptions row, which is the actual opt-in gate.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: dueRows } = await admin
    .from("el_profesor_review_state")
    .select("user_id")
    .lte("due", new Date().toISOString());
  if (!dueRows || dueRows.length === 0) return NextResponse.json({ sent: 0 });

  const dueCountByUser = new Map<string, number>();
  for (const row of dueRows) dueCountByUser.set(row.user_id, (dueCountByUser.get(row.user_id) ?? 0) + 1);

  let sent = 0;
  for (const [userId, count] of dueCountByUser) {
    await sendPushToUser(userId, {
      title: "Révision El Profesor",
      body: `${count} carte${count > 1 ? "s" : ""} à réviser aujourd'hui.`,
      link: "/apps/el-profesor/review?mode=due",
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
