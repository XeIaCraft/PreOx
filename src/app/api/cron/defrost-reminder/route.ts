import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";

export const maxDuration = 60;

/**
 * Evening reminder to defrost tomorrow's meal, triggered by Vercel Cron (see
 * vercel.json — daily 18:00 UTC). Same CRON_SECRET check as weekly-digest.
 * Push-only (no email): this is a same-day nudge, not a summary worth an inbox entry.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowPlacement = WEEKDAY_PLACEMENTS[(tomorrow.getDay() + 6) % 7];

  const { data: cards } = await admin
    .from("a_table_meal_cards")
    .select("user_id, recipe_id")
    .eq("status", "active")
    .eq("placement", tomorrowPlacement);
  if (!cards || cards.length === 0) return NextResponse.json({ sent: 0 });

  const recipeIds = [...new Set(cards.map((c) => c.recipe_id))];
  const { data: recipes } = await admin.from("a_table_recipes").select("id, title, needs_defrost").in("id", recipeIds);
  const recipeById = new Map((recipes ?? []).map((r) => [r.id, r]));

  let sent = 0;
  for (const card of cards) {
    const recipe = recipeById.get(card.recipe_id);
    if (!recipe?.needs_defrost) continue;
    await sendPushToUser(card.user_id, {
      title: "Pensez au congélateur",
      body: `« ${recipe.title} » est prévu demain — sortez l'ingrédient à décongeler ce soir.`,
      link: "/apps/a-table",
    });
    sent++;
  }

  return NextResponse.json({ sent });
}
