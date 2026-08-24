import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GeminiError } from "@/lib/gemini-shared";
import { estimateCostUsd, formatUsd } from "./ai-pricing";

// Split out of dal.ts (rather than living there like every other settings
// getter) because both gemini.ts and anthropic.ts need to call
// assertAiSpendCapNotExceeded before their own low-level API call, and
// dal.ts already imports EL_PROFESOR_GEMINI_MODEL_DEFAULT/
// EL_PROFESOR_CLAUDE_MODEL_DEFAULT from those two modules — importing back
// from dal.ts here would create a cycle.

/** Admin-configured monthly AI spend cap ($), or null when unset (no cap — default, unchanged behavior). */
export async function getAiSpendCapUsd(): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("ai_spend_cap_usd").eq("id", true).maybeSingle();
  return data?.ai_spend_cap_usd ?? null;
}

/** Sum of estimated Gemini + Claude cost (see ai-pricing.ts) since the 1st of the current calendar month (UTC) — the running total a spend cap is checked against. */
export async function getCurrentMonthAiSpendUsd(): Promise<number> {
  const admin = createAdminClient();
  const since = new Date();
  since.setUTCDate(1);
  since.setUTCHours(0, 0, 0, 0);

  const { data } = await admin
    .from("el_profesor_gemini_usage_log")
    .select("model, prompt_tokens, candidates_tokens")
    .eq("success", true)
    .gte("called_at", since.toISOString());

  let total = 0;
  for (const r of data ?? []) {
    total += estimateCostUsd(r.model, r.prompt_tokens ?? 0, r.candidates_tokens ?? 0) ?? 0;
  }
  return total;
}

/**
 * Blocks a new AI generation from starting once this month's estimated
 * spend has already reached the admin-configured cap — piste 2026-08-24
 * ("plafond de dépense IA"). Already-running work (an in-flight batch, a
 * retry of an already-started call) is never interrupted by this — it's
 * checked once before a new top-level generation begins. A no-op when no
 * cap is configured.
 */
export async function assertAiSpendCapNotExceeded(): Promise<void> {
  const cap = await getAiSpendCapUsd();
  if (cap == null) return;
  const spent = await getCurrentMonthAiSpendUsd();
  if (spent >= cap) {
    throw new GeminiError(
      `Plafond de dépense IA mensuel atteint (${formatUsd(spent)} / ${formatUsd(cap)}) — un administrateur doit l'augmenter dans les réglages d'El Profesor pour continuer à générer du contenu ce mois-ci.`
    );
  }
}
