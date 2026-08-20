import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/dal";
import { logActivity } from "@/lib/activity-log";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: user } = await supabase.from("profiles").select("full_name, email").eq("id", id).single();
  return { title: `Aperçu · ${user?.full_name || user?.email || "Utilisateur"}` };
}

/**
 * Read-only debugging aid ("voir en tant que"), deliberately scoped down
 * from full session impersonation: it never assumes the target user's
 * identity or renders their live interactive board, it only summarizes
 * what they have, via the service-role client (their per-user RLS-private
 * data — a-table/el-profesor rows never get an admin RLS override, so this
 * summary is the one place that legitimately bypasses it, logged below).
 * Good enough to answer "why is this user stuck / what do they actually
 * have" without the security surface of swapping session identity across
 * the whole app.
 */
export default async function UserPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { data: user } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (!user) notFound();

  await logActivity(admin.id, "preview_user", user.full_name || user.email);

  const adminClient = createAdminClient();
  const [
    { count: recipeCount },
    { count: mealCardCount },
    { count: historyCount },
    { data: aTableSettings },
    { count: reviewedCount },
    { count: dueTodayCount },
    { count: flashcardMasteredCount },
  ] = await Promise.all([
    adminClient.from("a_table_recipes").select("id", { count: "exact", head: true }).eq("user_id", id),
    adminClient.from("a_table_meal_cards").select("id", { count: "exact", head: true }).eq("user_id", id).eq("status", "active"),
    adminClient.from("a_table_history").select("id", { count: "exact", head: true }).eq("user_id", id),
    adminClient.from("a_table_settings").select("gemini_api_key_encrypted").eq("user_id", id).maybeSingle(),
    adminClient.from("el_profesor_review_log").select("id", { count: "exact", head: true }).eq("user_id", id),
    adminClient.from("el_profesor_review_state").select("id", { count: "exact", head: true }).eq("user_id", id).lte("due", new Date().toISOString()),
    adminClient.from("el_profesor_review_state").select("id", { count: "exact", head: true }).eq("user_id", id).eq("state", "review"),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/users/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à l&rsquo;utilisateur
        </Link>
        <h1 className="mt-3 flex items-center gap-2 font-serif-display text-2xl font-medium text-foreground">
          <Eye className="h-5 w-5 text-foreground-subtle" />
          Aperçu · {user.full_name || user.email}
        </h1>
      </div>

      <Alert variant="info">
        Aperçu en lecture seule à but de débogage — aucune action ne peut être effectuée au nom de cet utilisateur depuis cette page, et
        cette consultation est enregistrée dans le journal d&rsquo;activité.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>À table</CardTitle>
          <CardDescription>Résumé, pas le tableau interactif de l&rsquo;utilisateur.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Recettes" value={recipeCount ?? 0} />
          <Stat label="Cartes actives" value={mealCardCount ?? 0} />
          <Stat label="Repas cuisinés (total)" value={historyCount ?? 0} />
          <Stat label="Clé Gemini perso." value={aTableSettings?.gemini_api_key_encrypted ? "configurée" : "aucune"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>El Profesor</CardTitle>
          <CardDescription>Résumé de la progression de révision.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Révisions effectuées" value={reviewedCount ?? 0} />
          <Stat label="Cartes en attente" value={dueTodayCount ?? 0} />
          <Stat label="Cartes maîtrisées" value={flashcardMasteredCount ?? 0} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <p className="text-xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-foreground-subtle">{label}</p>
    </div>
  );
}
