import "server-only";

// Server side of the "Préop" module: access check, the rule library and
// the protocol library. Patient dossiers never come here (device only).
// Reached from the browser through app/api/preop/{rules,protocols} (plain
// fetch, not Server Actions — same reasons as the carnet).
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { createClient } from "@/lib/supabase/server";
import { ruleSchema } from "./rules/schema";
import type { Rule } from "./rules/types";
import { protocolSchema } from "./protocol-schema";
import { emptyProtocolContent, type Protocol } from "./protocols";
import type { Profile } from "@/lib/supabase/types";

export const PREOP_SLUG = "preop";

export async function requirePreopAccess(): Promise<Profile> {
  const profile = await requireProfile();
  const app = await getAppBySlugForProfile(PREOP_SLUG, profile);
  if (!app || !app.hasAccess) notFound();
  return profile;
}

function withoutOwner(row: Rule & { user_id: string }): Rule {
  const rule: Partial<Rule & { user_id: string }> = { ...row };
  delete rule.user_id;
  return rule as Rule;
}

export async function listRules(userId: string): Promise<Rule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("preop_rules").select("*").eq("user_id", userId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(withoutOwner);
}

export type SaveResult = { ok: true; rule: Rule } | { ok: false; error: string };

export async function saveRule(userId: string, input: unknown): Promise<SaveResult> {
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Règle invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preop_rules")
    .upsert({ ...parsed.data, user_id: userId } as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, rule: withoutOwner(data as Rule & { user_id: string }) };
}

export async function deleteRule(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("preop_rules").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

// -- Protocols ------------------------------------------------------------------

function protocolWithoutOwner(row: Protocol & { user_id: string }): Protocol {
  const p: Partial<Protocol & { user_id: string }> = { ...row };
  delete p.user_id;
  return { ...(p as Protocol), content: { ...emptyProtocolContent(), ...(p.content ?? {}) } };
}

export async function listProtocols(userId: string): Promise<Protocol[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("preop_protocols").select("*").eq("user_id", userId).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(protocolWithoutOwner);
}

export type SaveProtocolResult = { ok: true; protocol: Protocol } | { ok: false; error: string };

export async function saveProtocol(userId: string, input: unknown): Promise<SaveProtocolResult> {
  const parsed = protocolSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Protocole invalide" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preop_protocols")
    .upsert({ ...parsed.data, user_id: userId } as never, { onConflict: "id" })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, protocol: protocolWithoutOwner(data as Protocol & { user_id: string }) };
}

export async function deleteProtocol(userId: string, id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("preop_protocols").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
