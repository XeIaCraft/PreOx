import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export const maxDuration = 60;

/**
 * Weekly opt-in backup: emails each subscribed user a JSON export of their
 * full À table data, triggered by Vercel Cron (see vercel.json — Sundays
 * 09:00 UTC). Same CRON_SECRET check as the other cron routes. Opt-in via
 * a_table_settings.preferences.backup_export_enabled (see settings-dialog.tsx),
 * not a new profiles column — one more jsonb preference, same pattern as
 * auto_illustrate/weekly_budget_cap.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: settingsRows } = await admin.from("a_table_settings").select("user_id, preferences");
  const optedIn = (settingsRows ?? []).filter((s) => (s.preferences as { backup_export_enabled?: boolean })?.backup_export_enabled);
  if (optedIn.length === 0) return NextResponse.json({ sent: 0 });

  let sent = 0;
  for (const row of optedIn) {
    const { data: profile } = await admin.from("profiles").select("email, full_name").eq("id", row.user_id).maybeSingle();
    if (!profile?.email) continue;

    const [recipes, mealCards, tempIngredients, guestMenus, history, collections, weekTemplates] = await Promise.all([
      admin.from("a_table_recipes").select("*").eq("user_id", row.user_id),
      admin.from("a_table_meal_cards").select("*").eq("user_id", row.user_id).eq("status", "active"),
      admin.from("a_table_temporary_ingredients").select("*").eq("user_id", row.user_id),
      admin.from("a_table_guest_menus").select("*").eq("user_id", row.user_id),
      admin.from("a_table_history").select("*").eq("user_id", row.user_id),
      admin.from("a_table_collections").select("*").eq("user_id", row.user_id),
      admin.from("a_table_week_templates").select("*").eq("user_id", row.user_id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      preferences: row.preferences,
      recipes: recipes.data ?? [],
      meal_cards: mealCards.data ?? [],
      temporary_ingredients: tempIngredients.data ?? [],
      guest_menus: guestMenus.data ?? [],
      history: history.data ?? [],
      collections: collections.data ?? [],
      week_templates: weekTemplates.data ?? [],
    };

    const json = JSON.stringify(exportData, null, 2);
    const dateLabel = new Date().toISOString().slice(0, 10);

    await sendEmail({
      to: profile.email,
      subject: `Sauvegarde À table — ${dateLabel}`,
      html: `<p>Bonjour ${profile.full_name || ""},</p><p>Voici votre sauvegarde hebdomadaire À table en pièce jointe (${(recipes.data ?? []).length} recette(s), ${(history.data ?? []).length} entrée(s) d'historique).</p><p style="color:#888;font-size:12px">Vous recevez cet e-mail car la sauvegarde hebdomadaire est activée dans les réglages d'À table.</p>`,
      attachments: [{ filename: `a-table-sauvegarde-${dateLabel}.json`, content: Buffer.from(json).toString("base64") }],
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
