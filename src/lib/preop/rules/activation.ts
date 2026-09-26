// Proposed rules are imported ACTIVE — you re-read them afterwards — instead
// of waiting as drafts. An unchecked rule says so: its tool carries the mark,
// and its review date is the day it was activated (« à revérifier » in the
// library). When two proposals answer the same question, the most recent
// source wins and the other is archived, so that the library never holds two
// contradictory live answers.

import { SUPERSEDES } from "./verified";
import { TREATMENT_SUPERSEDES } from "./proposed-treatments";
import type { ProposedGroup } from "./proposed";
import type { Rule } from "./types";

type RuleInput = Omit<Rule, "created_at" | "updated_at">;

const UNCHECKED_TOOL = "PreOx : activée sans vérification sur la source — à relire";

/** Rule id → the older proposals it replaces. */
export const ALL_SUPERSEDES: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const map of [SUPERSEDES, TREATMENT_SUPERSEDES]) for (const [k, v] of Object.entries(map)) out[k] = [...(out[k] ?? []), ...v];
  return out;
})();

/** Was this rule activated without being checked against its source? */
export function isUnchecked(rule: Pick<RuleInput, "tool">): boolean {
  return rule.tool === UNCHECKED_TOOL;
}

export function activateUnchecked<T extends RuleInput>(rule: T, now: string): T {
  return {
    ...rule,
    status: "active",
    verified_at: now,
    review_at: now.slice(0, 10),
    tool: UNCHECKED_TOOL,
  };
}

/** Ids replaced by one of the live (non-archived) rules given. */
function replacedBy(live: Pick<RuleInput, "id" | "status">[]): Set<string> {
  return new Set(live.filter((r) => r.status !== "archived").flatMap((r) => ALL_SUPERSEDES[r.id] ?? []));
}

/** A rule you checked or wrote yourself is never touched. */
const replaceable = (r: RuleInput) => r.status === "draft" || (r.status === "active" && isUnchecked(r));

/**
 * What importing a group saves: its rules (active; archived when a newer rule
 * already answers the question), then the older proposals it replaces.
 */
export function importPlan(group: Pick<ProposedGroup, "rules" | "verified">, existing: RuleInput[], now: string): RuleInput[] {
  const live = [...existing, ...group.rules.map((r) => ({ id: r.id, status: "active" as const }))];
  const replaced = replacedBy(live);
  const own = group.rules.map((p) => (replaced.has(p.id) ? { ...p, status: "archived" as const } : group.verified ? p : activateUnchecked(p, now)));
  const archived = existing.filter((r) => replaced.has(r.id) && replaceable(r)).map((r) => ({ ...r, status: "archived" as const }));
  return [...own, ...archived];
}

/** Activates every draft of the library, archiving those a newer rule replaces. */
export function activateAllPlan(existing: RuleInput[], now: string): RuleInput[] {
  const replaced = replacedBy(existing);
  return existing
    .filter((r) => r.status === "draft" || (replaced.has(r.id) && replaceable(r)))
    .map((r) => (replaced.has(r.id) ? { ...r, status: "archived" as const } : activateUnchecked(r, now)));
}
