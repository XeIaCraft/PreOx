// The CBIP repertoire (Belgian Centre for Pharmacotherapeutic Information),
// built from its CSV export by scripts/build-cbip.py: every substance or
// combination marketed in Belgium, its brands with their CBIP page, and
// its CBIP chapter. The export has no ATC code, so each entry is linked by
// name to PreOx's ATC-coded list (medications.ts): matched substances keep
// their ATC code (rules, classes) and gain every Belgian brand; the others
// are added under their CBIP chapter — classes can target a chapter too.

import raw from "./cbip-data.json";
import { MEDICATIONS, type Medication } from "./medications";

interface CbipData {
  chapters: Record<string, string>;
  /** n: substances (« a + b »), h: chapter code, b: [brand, amppid][] */
  entries: { n: string; h: string; b: [string, number | null][] }[];
}

const data = raw as unknown as CbipData;

export const CBIP_CHAPTERS: Record<string, string> = data.chapters;

/** « Système nerveux › Antidépresseurs › Inhibiteurs de recapture sélectifs ». */
export function cbipChapterPath(code: string): string {
  const parts: string[] = [];
  for (let i = 1; i <= code.length; i++) {
    const t = data.chapters[code.slice(0, i)];
    if (t && !t.startsWith("Spécialités")) parts.push(t.replace(/<[^>]+>/g, ""));
  }
  return parts.join(" › ");
}

/** The CBIP page of one specialty (all its presentations, RCP and patient leaflet). */
export function cbipPageUrl(amppid: number): string {
  return `https://www.cbip.be/fr/contents/jump?amppid=${amppid}`;
}

const fold = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Brand's first word, folded (« Asaflow 80 » → « asaflow »). */
const brandKey = (b: string) => fold(b).split(" ")[0];

export interface CbipMedication extends Medication {
  id: string;
}

/**
 * PreOx's ATC list completed with the CBIP: each ATC-coded substance gains
 * the Belgian brands of the matching CBIP entry; CBIP entries PreOx doesn't
 * know are added with id « cbip:… », no ATC code, and — for a combination —
 * the ATC codes of the substances it does know.
 */
export function buildMedicationList(curated: Medication[] = MEDICATIONS): CbipMedication[] {
  const byName = new Map<string, Medication>();
  // « budésonide + formotérol » = « formotérol + budésonide ».
  const setKey = (parts: string[]) => parts.map(fold).sort().join("|");
  const bySet = new Map<string, Medication>();
  for (const m of curated) if (m.name.includes(" + ")) bySet.set(setKey(m.name.split(" + ")), m);
  const byBrand = new Map<string, Medication>();
  for (const m of curated) {
    byName.set(fold(m.name), m);
    for (const b of m.brands ?? []) if (b.length >= 4) byBrand.set(brandKey(b), m);
  }
  const extra = new Map<string, { brands: Set<string>; pages: Record<string, number>; chapter?: string }>();
  const added: CbipMedication[] = [];

  for (const e of data.entries) {
    const pages: Record<string, number> = {};
    for (const [b, p] of e.b) if (p) pages[b] = p;
    const brands = e.b.map(([b]) => b);
    const parts = e.n.split(" + ").map((s) => s.trim());
    // Known substance (by name), or a known product (by brand: Janumet, Coversyl Plus…).
    const known = (parts.length === 1 ? byName.get(fold(parts[0])) : bySet.get(setKey(parts))) ?? brands.map((b) => byBrand.get(brandKey(b))).find((m) => m && (parts.length === 1 || m.components?.length));
    if (known) {
      const x = extra.get(known.atc) ?? { brands: new Set<string>(), pages: {} };
      brands.forEach((b) => x.brands.add(b));
      Object.assign(x.pages, pages);
      x.chapter ??= e.h;
      extra.set(known.atc, x);
      continue;
    }
    const components = parts.map((p) => byName.get(fold(p))?.atc).filter((a): a is string => !!a);
    added.push({
      id: `cbip:${fold(e.n).replace(/ /g, "-").slice(0, 70)}`,
      atc: "",
      name: parts.map((p, i) => (i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p)).join(" + "),
      brands,
      components: components.length ? components : undefined,
      cbip: { chapter: e.h, pages },
    });
  }

  const enriched: CbipMedication[] = curated.map((m) => {
    const x = extra.get(m.atc);
    if (!x) return { ...m, id: m.atc };
    const brands = [...new Set([...(m.brands ?? []), ...x.brands])];
    return { ...m, id: m.atc, brands, cbip: { chapter: x.chapter ?? "", pages: x.pages } };
  });
  // Ids must stay unique (two CBIP entries folding to the same slug).
  const seen = new Set(enriched.map((m) => m.id));
  return [...enriched, ...added.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)))];
}

/** The CBIP page of a catalogue treatment (its first brand), or null when it isn't in the export. */
export function cbipLink(m: { cbip?: { pages: Record<string, number> } } | undefined): string | null {
  const first = m?.cbip ? Object.values(m.cbip.pages)[0] : undefined;
  return first ? cbipPageUrl(first) : null;
}
