import { notFound } from "next/navigation";
import Image from "next/image";
import { Logo } from "@/components/logo";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ATableRecipeRow } from "@/lib/supabase/types";

export const metadata = { title: "Recette partagée" };

/**
 * Public, unauthenticated read-only view of a shared recipe. Uses the
 * service-role client deliberately without a `requireAdmin()`/session check
 * — safe here because the query is scoped to exactly one row via an
 * unguessable random `share_token` (128-bit uuid), the same trust model as
 * the project's public storage buckets (gated by an opaque path, not by
 * role). Revoking the share (clearing the token) immediately breaks the link.
 */
export default async function SharedRecipePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("a_table_recipes").select("*").eq("share_token", token).maybeSingle();
  if (!data) notFound();

  const recipe = data as ATableRecipeRow;
  const ingredients = (recipe.ingredients as unknown as { name: string; quantity: number | null; unit: string }[]) ?? [];
  const steps = recipe.steps ?? [];
  const stepLabels = recipe.step_labels?.length === steps.length ? recipe.step_labels : [];

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Logo />
      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-foreground-subtle">Recette partagée depuis À table</p>
      <h1 className="mt-1 font-serif-display text-3xl font-medium text-foreground">{recipe.title}</h1>
      <p className="mt-1 text-sm text-foreground-muted">
        {recipe.servings} portion{recipe.servings > 1 ? "s" : ""}
        {recipe.cooking_minutes != null ? ` · ${recipe.cooking_minutes} min` : ""}
      </p>

      {recipe.image_url && (
        <div className="relative mt-4 aspect-video w-full overflow-hidden rounded-[var(--radius-lg)] bg-surface-muted">
          <Image src={recipe.image_url} alt={recipe.image_alt || recipe.title} fill sizes="672px" className="object-cover" />
        </div>
      )}

      {ingredients.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-subtle">Ingrédients</h2>
          <ul className="mt-2 space-y-1 text-sm text-foreground-muted">
            {ingredients.map((ing, i) => (
              <li key={i}>
                {ing.quantity ? `${ing.quantity} ${ing.unit} ` : ""}
                {ing.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground-subtle">Étapes</h2>
          <ol className="mt-2 space-y-3">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-tint text-xs font-medium text-primary-strong">
                  {i + 1}
                </span>
                <div>
                  {stepLabels[i] && <p className="text-xs font-medium text-foreground-subtle">{stepLabels[i]}</p>}
                  <p className="text-sm text-foreground-muted">{step}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
