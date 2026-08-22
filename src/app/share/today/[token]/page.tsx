import { notFound } from "next/navigation";
import Image from "next/image";
import { createAdminClient } from "@/lib/supabase/admin";
import { WEEKDAY_PLACEMENTS } from "@/lib/a-table/constants";
import type { ATableMealCardRow, ATableRecipeRow } from "@/lib/supabase/types";

export const metadata = { title: "Repas du jour" };
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated, embeddable "repas du jour" widget — same
 * opaque-token trust model as a shared recipe link (see share/recipe):
 * `today_widget_token` is an unguessable uuid, revoking it from the
 * settings dialog immediately breaks the embed. Deliberately minimal
 * markup so it reads well inside a small iframe.
 */
export default async function TodayWidgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: settings } = await supabase.from("a_table_settings").select("user_id").eq("today_widget_token", token).maybeSingle();
  if (!settings) notFound();

  const todayPlacement = WEEKDAY_PLACEMENTS[(new Date().getDay() + 6) % 7];
  const { data: card } = await supabase
    .from("a_table_meal_cards")
    .select("*")
    .eq("user_id", settings.user_id)
    .eq("status", "active")
    .eq("placement", todayPlacement)
    .maybeSingle();

  const mealCard = card as ATableMealCardRow | null;
  let recipe: ATableRecipeRow | null = null;
  if (mealCard) {
    const { data } = await supabase.from("a_table_recipes").select("*").eq("id", mealCard.recipe_id).maybeSingle();
    recipe = data as ATableRecipeRow | null;
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Repas du jour</p>
      {!recipe ? (
        <p className="text-sm text-foreground-muted">Rien de prévu aujourd&rsquo;hui.</p>
      ) : (
        <>
          {recipe.image_url && (
            <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] bg-surface-muted">
              <Image src={recipe.image_url} alt={recipe.image_alt || recipe.title} fill sizes="384px" className="object-cover" />
            </div>
          )}
          <p className="font-serif-display text-lg font-medium text-foreground">{recipe.title}</p>
          <p className="text-xs text-foreground-subtle">
            {mealCard?.servings ?? recipe.servings} portion{(mealCard?.servings ?? recipe.servings) > 1 ? "s" : ""}
            {recipe.cooking_minutes != null ? ` · ${recipe.cooking_minutes} min` : ""}
          </p>
        </>
      )}
    </div>
  );
}
