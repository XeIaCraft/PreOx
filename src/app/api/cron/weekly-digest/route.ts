import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export const maxDuration = 60;

/**
 * Weekly email digest, triggered by Vercel Cron (see vercel.json — Mondays
 * 08:00 UTC). Vercel automatically sends `Authorization: Bearer
 * $CRON_SECRET` on cron-triggered requests when an env var named exactly
 * CRON_SECRET is set, which is what this checks — anyone else hitting this
 * URL gets 401. Uses the service-role client since it reads across every
 * opted-in user's own private data to build their digest.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: users } = await admin.from("profiles").select("id, email, full_name").eq("notify_email_digest", true);
  if (!users || users.length === 0) return NextResponse.json({ sent: 0 });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: changelog } = await admin.from("changelog_entries").select("title").gte("published_at", weekAgo.toISOString()).limit(5);

  let sent = 0;
  for (const user of users) {
    const [{ count: dueCount }, { count: mealCount }] = await Promise.all([
      admin.from("el_profesor_review_state").select("id", { count: "exact", head: true }).eq("user_id", user.id).lte("due", new Date().toISOString()),
      admin
        .from("a_table_meal_cards")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active")
        .neq("placement", "backlog"),
    ]);

    if (!dueCount && !mealCount && (!changelog || changelog.length === 0)) continue;

    const lines: string[] = [];
    if (dueCount) lines.push(`<li>${dueCount} carte${dueCount > 1 ? "s" : ""} à réviser sur El Profesor</li>`);
    if (mealCount) lines.push(`<li>${mealCount} repas planifié${mealCount > 1 ? "s" : ""} sur À table cette semaine</li>`);
    if (changelog && changelog.length > 0) {
      lines.push(...changelog.map((c) => `<li>Nouveau : ${c.title}</li>`));
    }

    await sendEmail({
      to: user.email,
      subject: "Votre semaine sur PreOx",
      html: `<p>Bonjour ${user.full_name || ""},</p><ul>${lines.join("")}</ul><p><a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/apps">Ouvrir PreOx</a></p><p style="color:#888;font-size:12px">Vous recevez cet e-mail car le résumé hebdomadaire est activé dans vos préférences de notification.</p>`,
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
