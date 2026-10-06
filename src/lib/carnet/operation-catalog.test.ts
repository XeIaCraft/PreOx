import { describe, expect, it } from "vitest";
import { caseFieldsFromSurgery, loadOperationCatalog, searchOperations } from "./operation-catalog";
import { OPERATION_CATEGORIES } from "./referentiel";

describe("operation catalogue for the carnet", () => {
  const items = loadOperationCatalog();
  it("finds interventions as said at the bedside", () => {
    expect(searchOperations(items, "PTH").length).toBeGreaterThan(0);
    expect(searchOperations(items, "colectomie coelio")[0]?.name).toMatch(/olectomie/);
  });
  it("only fills a category the carnet knows", () => {
    const codes = new Set(OPERATION_CATEGORIES.map((c) => c.code));
    const bad = items.map(caseFieldsFromSurgery).filter((f) => f.operation_category && !codes.has(f.operation_category));
    expect(bad).toEqual([]);
    expect(items.filter((x) => !codes.has(x.category)).map((x) => `${x.name}: ${x.category}`).slice(0, 10)).toEqual([]);
  });
});
