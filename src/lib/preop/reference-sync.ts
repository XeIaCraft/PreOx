// Keeping the imported reference protocols and rules up to date, without
// deleting and re-importing them. A reference item you have not changed since
// it was imported is updated by itself; one you have changed is only
// proposed (your version is never overwritten silently).
//
// Protocols: the version imported is signed in their source field
// (« [PreOx réf. …] »): unchanged ⇔ its content still has that signature.
// Protocols imported before the signature existed count as unchanged when
// they were never edited (updated_at ≈ created_at).
// Rules: unchanged ⇔ still at their first version and never checked by you
// (draft, activated unchecked, or verified by PreOx on the same date).

import { REFERENCE_PROTOCOLS } from "./reference-protocols";
import type { Protocol, ProtocolContent } from "./protocols";
import type { ReferenceProtocol } from "./reference-protocol-kit";
import { activateUnchecked, isUnchecked } from "./rules/activation";
import { PROPOSED_GROUPS } from "./rules/proposed";
import type { Rule } from "./rules/types";

/** JSON with sorted keys and no undefined: the same text whatever the key order (jsonb reorders them). */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v as Record<string, unknown>)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

/** Short FNV-1a hash, enough to tell two versions apart. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

type ProtocolLike = Pick<Protocol, "name" | "surgery" | "operation_category" | "content">;

export const protocolSignature = (p: ProtocolLike) => hash(canonical({ name: p.name, surgery: p.surgery, operation_category: p.operation_category, content: p.content as ProtocolContent }));

const MARKER = /\s*\[PreOx réf\. ([a-z0-9]+)\]\s*$/;

/** The source without the signature (what the editor shows). */
export const sourceWithoutMarker = (source: string) => source.replace(MARKER, "");
const importedSignature = (source: string) => source.match(MARKER)?.[1] ?? null;

/** A reference protocol as it is saved: signed with its own content. */
export function signedReference(r: ReferenceProtocol): ReferenceProtocol {
  return { ...r, source: `${sourceWithoutMarker(r.source)} [PreOx réf. ${protocolSignature(r)}]` };
}

/** Keeps the signature of the version imported when you edit a protocol (it then counts as yours). */
export function keepMarker(previousSource: string, editedSource: string): string {
  const sig = importedSignature(previousSource);
  return sig ? `${sourceWithoutMarker(editedSource)} [PreOx réf. ${sig}]` : editedSource;
}

export interface ProtocolUpdate {
  reference: ReferenceProtocol;
  current: Protocol;
  /** Changed by you since it was imported: proposed, not applied. */
  modified: boolean;
}

const NEVER_EDITED_MS = 2 * 60_000;

/** Reference protocols whose imported copy is older than the current reference. */
export function protocolUpdates(protocols: Protocol[], references: ReferenceProtocol[] = REFERENCE_PROTOCOLS): ProtocolUpdate[] {
  const out: ProtocolUpdate[] = [];
  for (const r of references) {
    const current = protocols.find((p) => p.id === r.id);
    if (!current) continue;
    const refSig = protocolSignature(r);
    const mine = protocolSignature(current);
    const imported = importedSignature(current.source);
    if (mine === refSig) {
      // Same content as the reference: at most the signature to add (silent).
      if (imported !== refSig) out.push({ reference: r, current, modified: false });
      continue;
    }
    const modified = imported ? mine !== imported : new Date(current.updated_at).getTime() - new Date(current.created_at).getTime() > NEVER_EDITED_MS;
    out.push({ reference: r, current, modified });
  }
  return out;
}

// --- Rules ------------------------------------------------------------------------------------

type RuleInput = Omit<Rule, "created_at" | "updated_at">;

const ruleBody = (r: RuleInput) => canonical({ title: r.title, statement: r.statement, conditions: r.conditions, action: r.action, source: r.source, divergences: r.divergences, explanations: r.explanations, question: r.question });

export interface RuleUpdate {
  reference: RuleInput;
  current: Rule;
  modified: boolean;
  /** The rule as it will be saved (status kept). */
  next: RuleInput;
}

/** Proposed rules whose imported copy is older than the current proposal. */
export function ruleUpdates(rules: Rule[], now: string): RuleUpdate[] {
  const out: RuleUpdate[] = [];
  for (const g of PROPOSED_GROUPS)
    for (const ref of g.rules) {
      const current = rules.find((r) => r.id === ref.id);
      if (!current || ruleBody(current) === ruleBody(ref)) continue;
      const untouched = current.version === ref.version && (current.status === "draft" || current.status === "archived" || isUnchecked(current) || (g.verified && current.verified_at === ref.verified_at));
      const base = { ...ref, status: current.status };
      const next = current.status === "active" && !g.verified ? activateUnchecked(base, now) : current.status === "active" ? { ...base, verified_at: ref.verified_at ?? now } : { ...base, verified_at: null };
      out.push({ reference: ref, current, modified: !untouched, next });
    }
  return out;
}
