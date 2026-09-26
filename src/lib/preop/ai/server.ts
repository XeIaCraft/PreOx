import "server-only";

// The Préop AI assistant, server side: keys stay here (encrypted in the
// database), every outgoing text is checked by privacy.ts first, and only
// general questions are sent — never a dossier, initials or a consultation.
// Consensus finds the sources; Gemini drafts an answer in the block format
// that parse-answer.ts reads, from those sources. What comes back is a
// proposal: the rule is saved as a draft unless the user checks the source.

import { createClient } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { ANSWER_FORMAT } from "../rules/question";
import { outgoingText, privacyIssues, type PrivacyIssue } from "./privacy";
import type { AiStatus, ConsensusPaper } from "./types";

export type { AiStatus, ConsensusPaper };

export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const CONSENSUS_URL = "https://api.consensus.app/v1/search";
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";

export type AiResult<T> = { ok: true; value: T } | { ok: false; error: string; issues?: PrivacyIssue[] };

const month = () => new Date().toISOString().slice(0, 7);

interface SettingsRow {
  gemini_api_key_encrypted: string | null;
  gemini_model: string;
  consensus_api_key_encrypted: string | null;
  consensus_monthly_limit: number;
  consensus_usage: unknown;
}

async function readRow(userId: string): Promise<SettingsRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("preop_ai_settings")
    .select("gemini_api_key_encrypted, gemini_model, consensus_api_key_encrypted, consensus_monthly_limit, consensus_usage")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as SettingsRow | null) ?? null;
}

/** The Gemini key of À table, when the user set one there and none here. */
async function aTableGeminiKey(userId: string): Promise<{ key: string; model: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("a_table_settings").select("gemini_api_key_encrypted, gemini_model").eq("user_id", userId).maybeSingle();
  if (!data?.gemini_api_key_encrypted) return null;
  try {
    return { key: decryptSecret(data.gemini_api_key_encrypted), model: data.gemini_model || DEFAULT_GEMINI_MODEL };
  } catch {
    return null;
  }
}

const usageOf = (row: SettingsRow | null) => {
  const u = (row?.consensus_usage ?? {}) as Record<string, number>;
  return typeof u[month()] === "number" ? u[month()] : 0;
};

export async function aiStatus(userId: string): Promise<AiStatus> {
  const row = await readRow(userId);
  const fallback = row?.gemini_api_key_encrypted ? null : await aTableGeminiKey(userId);
  return {
    gemini: {
      configured: !!row?.gemini_api_key_encrypted || !!fallback,
      from: row?.gemini_api_key_encrypted ? "preop" : fallback ? "a-table" : null,
      model: row?.gemini_model || fallback?.model || DEFAULT_GEMINI_MODEL,
    },
    consensus: { configured: !!row?.consensus_api_key_encrypted, limit: row?.consensus_monthly_limit ?? 30, used: usageOf(row), month: month() },
  };
}

export interface AiSettingsInput {
  /** undefined: unchanged; "": removed. */
  geminiKey?: string;
  geminiModel?: string;
  consensusKey?: string;
  consensusLimit?: number;
}

export async function saveAiSettings(userId: string, input: AiSettingsInput): Promise<AiResult<AiStatus>> {
  const patch: Record<string, unknown> = { user_id: userId };
  if (input.geminiKey !== undefined) patch.gemini_api_key_encrypted = input.geminiKey.trim() ? encryptSecret(input.geminiKey.trim()) : null;
  if (input.consensusKey !== undefined) patch.consensus_api_key_encrypted = input.consensusKey.trim() ? encryptSecret(input.consensusKey.trim()) : null;
  if (input.geminiModel !== undefined) {
    const m = input.geminiModel.trim();
    if (m && !/^[a-z0-9.-]{3,60}$/.test(m)) return { ok: false, error: "Nom de modèle invalide." };
    patch.gemini_model = m || DEFAULT_GEMINI_MODEL;
  }
  if (input.consensusLimit !== undefined) {
    if (!Number.isInteger(input.consensusLimit) || input.consensusLimit < 0 || input.consensusLimit > 100000) return { ok: false, error: "Quota invalide." };
    patch.consensus_monthly_limit = input.consensusLimit;
  }
  const supabase = await createClient();
  const { error } = await supabase.from("preop_ai_settings").upsert(patch as never, { onConflict: "user_id" });
  if (error) {
    console.error("[preop/ai] save settings failed:", error.message);
    return { ok: false, error: "Enregistrement impossible (la migration 088 est-elle appliquée ?)." };
  }
  return { ok: true, value: await aiStatus(userId) };
}

function checkOutgoing(text: string): AiResult<string> {
  const sent = outgoingText(text);
  if (!sent) return { ok: false, error: "Question vide." };
  if (sent.length > 6000) return { ok: false, error: "Question trop longue." };
  const issues = privacyIssues(sent);
  if (issues.length) return { ok: false, error: "La question contient peut-être une donnée qui identifie un patient : reformulez-la de façon générale.", issues };
  return { ok: true, value: sent };
}

/** Consensus search on a general question (medical journals and guidelines, no preprints). Counts against the monthly quota. */
export async function consensusSearch(userId: string, query: string): Promise<AiResult<{ papers: ConsensusPaper[]; sent: string; used: number; limit: number }>> {
  const checked = checkOutgoing(query);
  if (!checked.ok) return checked;
  const row = await readRow(userId);
  if (!row?.consensus_api_key_encrypted) return { ok: false, error: "Aucune clé Consensus : ajoutez-la dans Paramètres › Assistant IA." };
  const used = usageOf(row);
  if (used >= row.consensus_monthly_limit) return { ok: false, error: `Quota Consensus atteint pour ce mois (${used}/${row.consensus_monthly_limit}).` };
  const params = new URLSearchParams({ query: checked.value.slice(0, 500), medical_mode: "true", exclude_preprints: "true" });
  let res: Response;
  try {
    res = await fetch(`${CONSENSUS_URL}?${params}`, { headers: { "x-api-key": decryptSecret(row.consensus_api_key_encrypted) }, cache: "no-store" });
  } catch {
    return { ok: false, error: "Consensus injoignable." };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Consensus a refusé la recherche (${res.status})${res.status === 401 || res.status === 403 ? " : clé invalide ou plan sans accès à l'API" : res.status === 429 ? " : quota de l'abonnement atteint" : ""}. ${body.slice(0, 160)}`.trim() };
  }
  const json = (await res.json().catch(() => null)) as { results?: Record<string, unknown>[] } | null;
  const papers: ConsensusPaper[] = (json?.results ?? []).slice(0, 10).map((r) => ({
    title: String(r.title ?? ""),
    authors: Array.isArray(r.authors) ? (r.authors as unknown[]).map(String).slice(0, 6) : [],
    year: typeof r.publish_year === "number" ? r.publish_year : null,
    journal: String(r.journal_name ?? ""),
    doi: String(r.doi ?? ""),
    url: String(r.url ?? ""),
    studyType: String(r.study_type ?? ""),
    citations: typeof r.citation_count === "number" ? r.citation_count : null,
    takeaway: String(r.takeaway ?? ""),
    abstract: String(r.abstract ?? "").slice(0, 1500),
  }));
  const supabase = await createClient();
  const usage = { ...((row.consensus_usage ?? {}) as Record<string, number>), [month()]: used + 1 };
  await supabase.from("preop_ai_settings").update({ consensus_usage: usage } as never).eq("user_id", userId);
  return { ok: true, value: { papers, sent: checked.value, used: used + 1, limit: row.consensus_monthly_limit } };
}

/** The instruction given to Gemini: the question (already in the rule format) and the sources found, if any. */
const PROTOCOL_FORMAT = `TECHNIQUE: recommended anaesthetic technique(s) and alternatives
MÉDICAMENTS: one line per drug — name, dose (per kg or fixed, with the weight used), route, timing — then its source in brackets
CIBLES: haemodynamic and ventilation targets
MATÉRIEL: monitoring and equipment
RISQUES: specific risks and what to do
POSTOPÉRATOIRE: analgesia, thromboprophylaxis, mobilisation
SOURCES: organisation or authors, title, year, DOI — only sources you are sure of`;

export function geminiInstructions(prompt: string, papers: ConsensusPaper[], mode: "rule" | "protocol" = "rule"): string {
  const sources = papers.length
    ? papers
        .map(
          (p, i) =>
            `[${i + 1}] ${p.title} — ${p.authors.slice(0, 3).join(", ")}${p.authors.length > 3 ? " et al." : ""}, ${p.journal} ${p.year ?? ""}. DOI: ${p.doi || "aucun"}. Type: ${p.studyType || "non précisé"}.\nTakeaway: ${p.takeaway}\nAbstract: ${p.abstract}`
        )
        .join("\n\n")
    : "(aucune source fournie)";
  return [
    mode === "rule" ? "You help an anaesthesiologist write GENERAL perioperative rules (not about one patient)." : "You help an anaesthesiologist draft a GENERAL anaesthesia protocol for a type of intervention (not about one patient).",
    "Rules for your answer:",
    "- Base each block on the sources below when they cover the question; you may also cite a major guideline you are certain exists (ESAIC, ESRA, ESC, ASRA, SFAR, Belgian KCE or Superior Health Council).",
    "- Never invent an identifier: PMID and DOI only when you are sure (the DOIs below are exact), otherwise write \"aucun\".",
    "- CITATION: copy a sentence from the abstracts or takeaways below when possible; otherwise write \"à vérifier dans la source\". Never paraphrase inside CITATION.",
    "- Say so when sources disagree, with one block per source.",
    mode === "rule" ? "- Output only the blocks, in French, in this exact format:" : "- Answer in French with exactly these headings; every dose must name its source, and write « à vérifier » where no source gives it:",
    mode === "rule" ? ANSWER_FORMAT : PROTOCOL_FORMAT,
    "",
    "QUESTION:",
    prompt,
    "",
    "SOURCES FOUND (Consensus):",
    sources,
  ].join("\n");
}

/** Gemini drafts the answer in the block format. */
export async function geminiDraft(userId: string, prompt: string, papers: ConsensusPaper[], mode: "rule" | "protocol" = "rule"): Promise<AiResult<{ text: string; model: string; sent: string }>> {
  const checked = checkOutgoing(prompt);
  if (!checked.ok) return checked;
  const row = await readRow(userId);
  let key: string | null = null;
  let model = row?.gemini_model || DEFAULT_GEMINI_MODEL;
  if (row?.gemini_api_key_encrypted) key = decryptSecret(row.gemini_api_key_encrypted);
  else {
    const fb = await aTableGeminiKey(userId);
    if (fb) {
      key = fb.key;
      model = fb.model;
    }
  }
  if (!key) return { ok: false, error: "Aucune clé Gemini : ajoutez-la dans Paramètres › Assistant IA (la clé gratuite de Google AI Studio suffit)." };
  const instructions = geminiInstructions(checked.value, papers, mode);
  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: instructions }] }], generationConfig: { temperature: 0.2 } }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "Gemini injoignable." };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Gemini a refusé la demande (${res.status})${res.status === 429 ? " : quota gratuit atteint, réessayez plus tard" : res.status === 400 || res.status === 403 ? " : clé ou modèle invalide" : ""}. ${body.slice(0, 160)}`.trim() };
  }
  const payload = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
  const text = payload?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text.trim()) return { ok: false, error: "Réponse Gemini vide." };
  return { ok: true, value: { text, model, sent: checked.value } };
}
