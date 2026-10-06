// The Préop catalogue of interventions, to help type the operation of a
// case: the same search as Préop (« PTH », « colectomie cœlio »…), with the
// interventions added or edited in Préop › Paramètres (cached on this
// device by Préop). Loaded on demand: the carnet bundle stays small.

import { SURGERY_CATALOG } from "@/lib/preop/surgeries";
import { mergeList, type AllOverrides, type SurgeryItem } from "@/lib/preop/catalog";
import { searchSurgeries } from "@/lib/preop/surgery-search";
import { OPERATION_CATEGORIES } from "./referentiel";

const PREOP_CATALOG_CACHE = "preox:preop:catalogs";
const CATEGORY_CODES = new Set(OPERATION_CATEGORIES.map((c) => c.code));

export function loadOperationCatalog(): SurgeryItem[] {
  let overrides: AllOverrides = {};
  try {
    const raw = localStorage.getItem(PREOP_CATALOG_CACHE);
    if (raw) overrides = JSON.parse(raw) as AllOverrides;
  } catch {
    // No cache or blocked storage: the built-in catalogue.
  }
  return mergeList(SURGERY_CATALOG as SurgeryItem[], overrides.surgeries);
}

export function searchOperations(items: SurgeryItem[], query: string, limit = 6): SurgeryItem[] {
  return searchSurgeries(items, query, {}, limit);
}

/** What an intervention of the catalogue fills in a case: its name, its carnet category, general anaesthesia when usual, under 4 for a newborn. */
export function caseFieldsFromSurgery(item: SurgeryItem): { operation: string; operation_category?: string; general_anesthesia?: boolean; pediatric_under_4?: boolean } {
  return {
    operation: item.name,
    ...(CATEGORY_CODES.has(item.category) ? { operation_category: item.category } : {}),
    ...(item.techniques?.includes("general") ? { general_anesthesia: true } : {}),
    ...(item.population === "neonate" ? { pediatric_under_4: true } : {}),
  };
}
