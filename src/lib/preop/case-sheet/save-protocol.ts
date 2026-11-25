// A plan adapted on the sheet, as the library's protocol (or a variant of
// it). The plan the sheet works on is the protocol reduced to the chosen
// technique, plus the equipment and precautions this patient's antecedents
// add: neither belongs to the protocol. What the technique left out is put
// back, what the patient added is taken off, what was changed is kept.

import { fold } from "../catalog";
import type { Protocol, ProtocolContent } from "../protocols";

export interface AutoAdditions {
  material: string[];
  /** Titles of the risks. */
  risks: string[];
}

const same = (a: string, b: string) => fold(a) === fold(b);

/**
 * @param plan the plan as adapted on the sheet
 * @param base the library's protocol it started from, if any
 * @param reducedBase that protocol reduced to the sheet's technique (what the plan started from)
 * @param auto what the patient's antecedents added to the plan by themselves
 */
export function planForLibrary(plan: ProtocolContent, base: Protocol | null, reducedBase: ProtocolContent | null, auto: AutoAdditions): ProtocolContent {
  const out = structuredClone(plan);
  const own = base?.content;
  // Equipment and precautions: those of the patient (not in the protocol) are left out.
  out.material = plan.material.filter((m) => !auto.material.some((a) => same(a, m)) || (own?.material ?? []).some((x) => same(x, m)));
  out.risks = plan.risks.filter((r) => !auto.risks.some((a) => same(a, r.title)) || (own?.risks ?? []).some((x) => same(x.title, r.title)));
  if (own && reducedBase) {
    // What the chosen technique left out of the protocol (the other technique's drugs, the gases) stays in it.
    const kept = new Set(reducedBase.drugs.map((d) => d.id));
    out.drugs = [...plan.drugs, ...own.drugs.filter((d) => !kept.has(d.id))];
    if (reducedBase.techniques.length !== own.techniques.length || reducedBase.techniques.some((t) => !own.techniques.includes(t))) out.techniques = [...new Set([...own.techniques, ...plan.techniques])];
    out.gases = plan.gases ?? own.gases;
  }
  return out;
}
