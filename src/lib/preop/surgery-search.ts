// Finding an intervention as it is said at the consultation — « colectomie
// cœlio », « PTH », « néphrectomie partielle robot », « hernie enfant » —
// and ranking it for the patient: an operation for the other sex is left
// out, children's entries come first for a child and last for an adult.

import { fold, type SurgeryItem } from "./catalog";
import { APPROACHES, type Approach } from "./surgeries";

/** Everyday words for each approach, so « coelio », « robot », « VATS » find their variant. */
const APPROACH_WORDS: Record<Approach, string[]> = {
  open: ["ouverte", "ouvert", "laparotomie", "thoracotomie", "lombotomie", "sternotomie", "classique"],
  laparoscopic: ["coelio", "coelioscopie", "laparoscopie", "celio"],
  robotic: ["robot", "robotique", "da vinci"],
  thoracoscopic: ["vats", "thoracoscopie"],
  endoscopic: ["endoscopie", "endoscopique"],
  arthroscopic: ["arthroscopie", "arthro"],
  percutaneous: ["percutane", "percutanee"],
  endovascular: ["endovasculaire", "endo"],
  vaginal: ["vaginale", "voie basse"],
  transoral: ["transorale"],
  microsurgical: ["micro"],
};

export interface SurgeryPatient {
  age?: number;
  sex?: "M" | "F";
}

export function surgeryHaystack(s: SurgeryItem): string {
  return fold([s.name, ...(s.aka ?? []), ...(s.approach ? [APPROACHES.find((a) => a.code === s.approach)?.short ?? "", ...APPROACH_WORDS[s.approach]] : []), s.population === "child" || s.population === "neonate" ? "enfant pediatrique nourrisson" : ""].join(" "));
}

/** Entries matching every word typed (as the start of a word), best first, for this patient. */
export function searchSurgeries(items: SurgeryItem[], query: string, patient: SurgeryPatient = {}, limit = 10): SurgeryItem[] {
  const words = fold(query).split(/[\s,;/]+/).filter(Boolean);
  if (!words.length) return [];
  const child = patient.age !== undefined && patient.age < 16;
  const scored: { s: SurgeryItem; score: number }[] = [];
  for (const s of items) {
    if (patient.sex && s.sex && s.sex !== patient.sex) continue;
    const hay = surgeryHaystack(s);
    const tokens = hay.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    let all = true;
    for (const w of words) {
      if (tokens.includes(w)) score += 3;
      else if (tokens.some((t) => t.startsWith(w))) score += 2;
      else if (w.length >= 3 && hay.includes(w)) score += 1;
      else {
        all = false;
        break;
      }
    }
    if (!all) continue;
    const name = fold(s.name);
    if (name.startsWith(words[0])) score += 2;
    // Shorter names first when equal (the general entry before its variants).
    score -= name.length / 200;
    if (s.population === "child" || s.population === "neonate") score += child ? 3 : -3;
    else if (child && s.population === undefined) score -= 0.5;
    scored.push({ s, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.s);
}

/** The other variants of an operation (same family), for this patient. */
export function surgeryVariants(items: SurgeryItem[], s: { catalogId?: string }, patient: SurgeryPatient = {}): SurgeryItem[] {
  const current = s.catalogId ? items.find((x) => x.id === s.catalogId) : undefined;
  if (!current?.family) return [];
  return items.filter((x) => x.family === current.family && x.id !== current.id && !(patient.sex && x.sex && x.sex !== patient.sex));
}
