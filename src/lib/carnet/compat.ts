// Rows written before migration 082 (single regional type / technical act,
// separate "activité" of a stage, no candidate signature) can still come
// from a device's local cache or its queue of unsent changes. They are
// upgraded to the current shape on the way in — on the device when the
// cache is read or a change is applied, on the server before validation —
// so an old offline change is never lost nor rejected.
import type { CarnetCollection, CarnetData, CarnetProfile } from "./types";

type Row = Record<string, unknown>;

function mergeSector(sector: unknown, activity: unknown): string {
  const s = typeof sector === "string" ? sector.trim() : "";
  const a = typeof activity === "string" ? activity.trim() : "";
  if (!s) return a;
  if (!a || a.toLowerCase() === s.toLowerCase()) return s;
  return `${s} – ${a}`;
}

function upgradeFields(collection: CarnetCollection, row: Row, full: boolean): Row {
  if (collection === "cases") {
    const next: Row = { ...row };
    if ("regional_type" in next) {
      if (!("regional_types" in next)) next.regional_types = typeof next.regional_type === "string" ? [next.regional_type] : [];
      delete next.regional_type;
    }
    if ("technical_act" in next) {
      if (!("technical_acts" in next)) next.technical_acts = typeof next.technical_act === "string" ? [next.technical_act] : [];
      delete next.technical_act;
    }
    if (full) {
      if (!Array.isArray(next.regional_types)) next.regional_types = [];
      if (!Array.isArray(next.technical_acts)) next.technical_acts = [];
      if (!next.other_labels || typeof next.other_labels !== "object") next.other_labels = {};
      if (!next.details || typeof next.details !== "object") next.details = {};
      if (typeof next.planned !== "boolean") next.planned = false;
    }
    return next;
  }
  if (collection === "stages") {
    const next: Row = { ...row };
    if ("activity" in next) {
      next.sector = mergeSector(next.sector, next.activity);
      delete next.activity;
    }
    if (full && next.supervisor_id === undefined) next.supervisor_id = null;
    return next;
  }
  if ((collection === "related_activities" || collection === "courses") && full && row.signature_id === undefined) return { ...row, signature_id: null };
  return row;
}

/** A full row ("put"), filling the new columns' defaults. */
export function upgradeRow(collection: CarnetCollection, row: Row): Row {
  return upgradeFields(collection, row, true);
}

/** A partial row ("patch"): only renames/merges what's there. */
export function upgradePatch(collection: CarnetCollection, patch: Row): Row {
  return upgradeFields(collection, patch, false);
}

export function upgradeProfile(profile: CarnetProfile | null): CarnetProfile | null {
  if (!profile) return null;
  return typeof profile.signature === "string" ? profile : { ...profile, signature: "" };
}

/** A whole cached snapshot. */
export function upgradeData(data: CarnetData): CarnetData {
  return {
    ...data,
    profile: upgradeProfile(data.profile),
    stages: data.stages.map((s) => upgradeRow("stages", s as unknown as Row) as unknown as CarnetData["stages"][number]),
    cases: data.cases.map((c) => upgradeRow("cases", c as unknown as Row) as unknown as CarnetData["cases"][number]),
  };
}
