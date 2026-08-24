import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EL_PROFESOR_GEMINI_MODEL_DEFAULT } from "../gemini";
import { EL_PROFESOR_CLAUDE_MODEL_DEFAULT } from "../anthropic";
import { decryptSecret } from "@/lib/crypto";
import { GeminiError } from "@/lib/gemini-shared";
import { estimateCostUsd } from "../ai-pricing";

/** Currently configured Gemini model — falls back to the built-in default if the settings row is somehow missing. */
export async function getElProfesorGeminiModel(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("gemini_model").eq("id", true).single();
  return data?.gemini_model || EL_PROFESOR_GEMINI_MODEL_DEFAULT;
}

/** Whether an admin has configured the Gemini key from the settings UI — safe to expose to any user, unlike the key itself. */
export async function hasElProfesorGeminiKey(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_secrets").select("gemini_api_key_encrypted").eq("id", true).maybeSingle();
  return Boolean(data?.gemini_api_key_encrypted);
}

/** How many extra rotation keys are configured — safe to expose as a count, unlike the keys themselves. */
export async function getElProfesorGeminiExtraKeyCount(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_secrets").select("gemini_extra_keys_encrypted").eq("id", true).maybeSingle();
  return ((data?.gemini_extra_keys_encrypted as string[] | null) ?? []).length;
}

/** Configured fallback model (or null if unset) — just a model name, safe to expose. */
export async function getElProfesorGeminiFallbackModel(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("gemini_fallback_model").eq("id", true).maybeSingle();
  return data?.gemini_fallback_model ?? null;
}

/**
 * Ordered lists of Gemini API keys and models to try — every
 * extraction/proposal action needs this together. Uses the service-role
 * client: the key table is admin-write/admin-read RLS (see 20260101000019),
 * but reading the *decrypted* key server-side to call Gemini on behalf of a
 * non-admin user (e.g. "select passage -> generate") is exactly the
 * trusted-server-action pattern already used elsewhere (`toggleFicheShare`,
 * `proposeFromSelection`'s insert) — the caller's own access was already
 * checked by `requireElProfesorAccess()` before this is reached.
 *
 * `apiKeys` is [primary, ...extra keys] in the admin-configured order;
 * `models` is [primary model, fallback model] (fallback omitted if unset).
 * The caller (see lib/el-profesor/gemini.ts's rotation helpers) tries every
 * key for the primary model before falling back to the secondary model, so a
 * quota (429) or capacity (503) error on one key/model automatically retries
 * with the next before surfacing an error to the admin.
 */
export async function getElProfesorGeminiConfig(): Promise<{ apiKeys: string[]; models: string[] }> {
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin.from("el_profesor_settings").select("gemini_model, gemini_fallback_model").eq("id", true).maybeSingle(),
    admin.from("el_profesor_secrets").select("gemini_api_key_encrypted, gemini_extra_keys_encrypted").eq("id", true).maybeSingle(),
  ]);

  if (!secrets?.gemini_api_key_encrypted) {
    throw new GeminiError("Clé API Gemini non configurée. Un administrateur doit la renseigner dans les réglages d'El Profesor.");
  }

  const extraKeys = ((secrets.gemini_extra_keys_encrypted as string[] | null) ?? []).map((k) => decryptSecret(k));
  const apiKeys = [decryptSecret(secrets.gemini_api_key_encrypted), ...extraKeys];

  const models = [settings?.gemini_model || EL_PROFESOR_GEMINI_MODEL_DEFAULT];
  if (settings?.gemini_fallback_model && settings.gemini_fallback_model !== models[0]) {
    models.push(settings.gemini_fallback_model);
  }

  return { apiKeys, models };
}

export type ElProfesorAiProvider = "gemini" | "claude";

/** Which AI provider powers extraction/complément — an admin-configurable alternative to Gemini when its quota runs out. */
export async function getElProfesorAiProvider(): Promise<ElProfesorAiProvider> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("ai_provider").eq("id", true).maybeSingle();
  return data?.ai_provider === "claude" ? "claude" : "gemini";
}

/** Currently configured Claude model — falls back to the built-in default if the settings row is somehow missing. */
export async function getElProfesorClaudeModel(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_settings").select("claude_model").eq("id", true).maybeSingle();
  return data?.claude_model || EL_PROFESOR_CLAUDE_MODEL_DEFAULT;
}

/** Whether an admin has configured the Claude key — safe to expose to any user, unlike the key itself. */
export async function hasElProfesorClaudeKey(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("el_profesor_secrets").select("claude_api_key_encrypted").eq("id", true).maybeSingle();
  return Boolean(data?.claude_api_key_encrypted);
}

/** Decrypted Claude API key + configured model, for the trusted-server-action extraction pipeline (same pattern as getElProfesorGeminiConfig). */
export async function getElProfesorClaudeConfig(): Promise<{ apiKey: string; model: string }> {
  const admin = createAdminClient();
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin.from("el_profesor_settings").select("claude_model").eq("id", true).maybeSingle(),
    admin.from("el_profesor_secrets").select("claude_api_key_encrypted").eq("id", true).maybeSingle(),
  ]);

  if (!secrets?.claude_api_key_encrypted) {
    throw new GeminiError("Clé API Claude non configurée. Un administrateur doit la renseigner dans les réglages d'El Profesor.");
  }

  return {
    apiKey: decryptSecret(secrets.claude_api_key_encrypted),
    model: settings?.claude_model || EL_PROFESOR_CLAUDE_MODEL_DEFAULT,
  };
}

export { getAiSpendCapUsd, getCurrentMonthAiSpendUsd } from "../ai-spend-cap";

export interface GeminiUsageWindowStats {
  calls: number;
  failures: number;
  totalTokens: number;
  /** Sum over calls whose model matched a known pricing tier — see ai-pricing.ts. */
  estimatedCostUsd: number;
  /** True if at least one call in this window used a model with no known pricing tier — estimatedCostUsd then understates the real total. */
  hasUnpricedCalls: boolean;
}

export interface GeminiUsageStats {
  last24h: GeminiUsageWindowStats;
  last7d: GeminiUsageWindowStats;
  byModel: (GeminiUsageWindowStats & { model: string })[];
  recentFailures: { calledAt: string; model: string; statusCode: number | null; errorMessage: string | null }[];
}

/** Quota/consumption journal summary for the admin "Réglages IA" panel — item 48 of the backlog. Cost is a rough estimate (see ai-pricing.ts), added 2026-08-24. */
export async function getGeminiUsageStats(): Promise<GeminiUsageStats> {
  const supabase = await createClient();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows } = await supabase
    .from("el_profesor_gemini_usage_log")
    .select("called_at, model, success, status_code, prompt_tokens, candidates_tokens, total_tokens, error_message")
    .gte("called_at", since7d)
    .order("called_at", { ascending: false });

  const since24h = Date.now() - 24 * 60 * 60 * 1000;
  const all = rows ?? [];
  const last24hRows = all.filter((r) => new Date(r.called_at).getTime() >= since24h);

  function summarize(list: typeof all): GeminiUsageWindowStats {
    let estimatedCostUsd = 0;
    let hasUnpricedCalls = false;
    for (const r of list) {
      const cost = estimateCostUsd(r.model, r.prompt_tokens ?? 0, r.candidates_tokens ?? 0);
      if (cost === null) hasUnpricedCalls = true;
      else estimatedCostUsd += cost;
    }
    return {
      calls: list.length,
      failures: list.filter((r) => !r.success).length,
      totalTokens: list.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0),
      estimatedCostUsd,
      hasUnpricedCalls,
    };
  }

  const byModelRows = new Map<string, typeof all>();
  for (const r of all) {
    const list = byModelRows.get(r.model) ?? [];
    list.push(r);
    byModelRows.set(r.model, list);
  }

  return {
    last24h: summarize(last24hRows),
    last7d: summarize(all),
    byModel: [...byModelRows.entries()]
      .map(([model, list]) => ({ model, ...summarize(list) }))
      .sort((a, b) => b.calls - a.calls),
    recentFailures: all
      .filter((r) => !r.success)
      .slice(0, 5)
      .map((r) => ({ calledAt: r.called_at, model: r.model, statusCode: r.status_code, errorMessage: r.error_message })),
  };
}
