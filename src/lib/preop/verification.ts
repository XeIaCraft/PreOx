// Every item of Paramètres (antecedent, allergen, intervention, treatment,
// class, threshold) carries the date it was last checked against the
// literature. Here: its state (never / to re-check / checked) and the
// question to paste into Consensus or OpenEvidence to check it — what the
// item says, statement by statement, to confirm or correct with a source.

import type { AllergenItem, CatalogKind, Catalogs, ConditionItem, DrugClassItem, MedicationItem, SurgeryItem, ValueCheckItem, Verifiable } from "./catalog";
import { SYSTEM_LABELS } from "./catalog";
import { QUALIFIER_LABELS, type Qualifier } from "./history";
import { SURGERY_GRADES, BLEEDING_RISKS } from "./surgeries";
import { TECHNIQUES } from "./rules/types";
import { WATCHED_VALUES } from "./value-checks";

/** After two years a check is due again. */
export const RECHECK_AFTER_DAYS = 730;

export type VerificationState = "never" | "stale" | "ok";

export function verificationState(item: Verifiable, today: string = new Date().toISOString().slice(0, 10)): VerificationState {
  if (!item.verifiedAt) return "never";
  const age = (new Date(today).getTime() - new Date(item.verifiedAt).getTime()) / 86_400_000;
  return age > RECHECK_AFTER_DAYS ? "stale" : "ok";
}

type AnyItem = Catalogs[CatalogKind][number];

const OP: Record<string, string> = { "<": "<", "<=": "≤", ">": ">", ">=": "≥" };
const RISK: Record<string, string> = { low: "faible", intermediate: "intermédiaire", high: "élevé" };

/** What the item asserts, one statement per line — what has to be checked. */
export function itemStatements(kind: CatalogKind, item: AnyItem): string[] {
  switch (kind) {
    case "conditions": {
      const c = item as ConditionItem;
      const out: string[] = [];
      if (c.asa) out.push(`${c.label} : classe ASA suggérée ${c.asa} (exemples ASA 2020).`);
      for (const q of Object.keys(c.asaIf ?? {}) as Qualifier[]) out.push(`${c.label} ${c.qualifiers?.[q] ?? QUALIFIER_LABELS[q]} : classe ASA ${c.asaIf![q]}.`);
      if (c.attention) out.push(`${c.label} — précaution périopératoire : ${c.attention.text}${c.attention.material?.length ? ` (matériel : ${c.attention.material.join(", ")})` : ""}`);
      for (const q of Object.keys(c.attentionIf ?? {}) as Qualifier[]) out.push(`${c.label} ${c.qualifiers?.[q] ?? QUALIFIER_LABELS[q]} — précaution : ${c.attentionIf![q]!.text}`);
      for (const d of c.details ?? [])
        for (const o of d.options ?? []) {
          if (o.asa) out.push(`${c.label}, ${d.label} « ${o.label} » : classe ASA ${o.asa}.`);
          if (o.attention) out.push(`${c.label}, ${d.label} « ${o.label} » — précaution : ${o.attention.text}`);
        }
      return out.length ? out : [`${c.label} (${SYSTEM_LABELS[c.system]}) : implications anesthésiques à documenter.`];
    }
    case "allergens": {
      const a = item as AllergenItem;
      return [`Allergie déclarée à ${a.label.toLowerCase()} — conduite : ${a.attention.text}`, ...(a.drugWords.length ? [`Produits à éviter ou à discuter : ${a.drugWords.join(", ")}.`] : [])];
    }
    case "surgeries": {
      const s = item as SurgeryItem;
      return [
        `${s.name} : chirurgie ${SURGERY_GRADES.find((g) => g.code === s.grade)?.label.toLowerCase()} (exemples NICE NG45).`,
        `${s.name} : risque cardiaque chirurgical ${RISK[s.cardiacRisk]} (classes ESC 2022).`,
        `${s.name} : risque hémorragique ${BLEEDING_RISKS.find((b) => b.code === s.bleedingRisk)?.label.toLowerCase()} (guide EHRA 2021).`,
        `${s.name} : ${s.rcriHighRisk ? "compte" : "ne compte pas"} comme chirurgie à haut risque de l'indice de Lee.`,
        ...(s.techniques?.length ? [`${s.name} : technique(s) habituelle(s) : ${s.techniques.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.toLowerCase() ?? t).join(", ")}.`] : []),
      ];
    }
    case "medications":
    case "drugClasses": {
      const m = item as MedicationItem | DrugClassItem;
      const name = "name" in m ? `${m.name} (ATC ${m.atc})` : `${m.label} (ATC ${m.atc})`;
      return [
        ...(m.attention ? [`${name} — précaution périopératoire : ${m.attention.text}`] : []),
        ...(m.interactions ?? []).map((ix) => `${name} + ${ix.with} : ${ix.effect}`),
      ].concat(m.attention || m.interactions?.length ? [] : [`${name} : gestion périopératoire (poursuivre, arrêter, délai) à documenter.`]);
    }
    case "values": {
      const v = item as ValueCheckItem;
      const def = WATCHED_VALUES.find((w) => w.code === v.value);
      return [`${def?.label ?? v.value} ${OP[v.op]} ${String(v.threshold).replace(".", ",")} ${def?.unit ?? ""}${v.sex ? ` (${v.sex === "M" ? "homme" : "femme"})` : ""} en consultation d'anesthésie : ${v.attention?.text ?? "seuil de définition"}`.trim()];
    }
  }
}

/** The question to paste into Consensus / OpenEvidence to check one or several items. */
export function verificationPrompt(kind: CatalogKind, items: AnyItem[]): string {
  const statements = items.flatMap((i) => itemStatements(kind, i));
  return [
    "Question: Check each statement below against the current literature and guidelines used in anaesthesiology. For each one, say whether it is correct and up to date; if not, give the corrected statement.",
    "",
    ...statements.map((s, i) => `${i + 1}) ${s}`),
    "",
    "Context: anaesthesiologist practising in Belgium, preoperative consultation, adult patients unless stated.",
    "",
    "Source priority: 1) Belgian guidance (KCE, Superior Health Council, BCFI/CBIP, SARB, BARA); 2) European guidelines (ESAIC, ESRA, ESC, EHRA, ERC); 3) other societies (ASRA, SFAR, ASA). State explicitly when sources disagree.",
    "",
    "Answer in French, one block per statement, exactly this format:",
    "ÉNONCÉ: number",
    "VERDICT: CONFIRMÉ or À CORRIGER",
    "CORRECTION: corrected statement, or « aucune »",
    "SOURCE: organisation, title, year",
    "CITATION: exact sentence copied from the source",
  ].join("\n");
}
