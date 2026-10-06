// Who signs the record of cases (and duties), and whose name the carnet
// shows next to each case: the supervisor of the day (the case's tutor, the
// duty's supervisor) or the stage's maître de stage — in some hospitals the
// maître de stage signs the whole record at once, at the end of the stage.
// Both are settings (key « signing »), the official rule not being clear.

import type { CarnetCase, CarnetDuty, CarnetSetting, CarnetStage } from "./types";

export type SignerRole = "day" | "stage_master";

export interface SigningSettings {
  /** Who signs the cases and duties. */
  signer: SignerRole;
  /** Whose name fills the « tuteur » column of the record of cases. */
  nameShown: SignerRole;
}

export const DEFAULT_SIGNING_SETTINGS: SigningSettings = { signer: "stage_master", nameShown: "day" };

export const SIGNER_LABEL: Record<SignerRole, string> = { day: "Superviseur du jour", stage_master: "Maître de stage" };

const isRole = (v: unknown): v is SignerRole => v === "day" || v === "stage_master";

export function signingSettingsFrom(settings: CarnetSetting[]): SigningSettings {
  const value = settings.find((s) => s.key === "signing")?.value ?? {};
  return {
    signer: isRole(value.signer) ? value.signer : DEFAULT_SIGNING_SETTINGS.signer,
    nameShown: isRole(value.nameShown) ? value.nameShown : DEFAULT_SIGNING_SETTINGS.nameShown,
  };
}

/** The person for a case or a duty under a given role (null: none chosen yet). */
export function personFor(role: SignerRole, stages: Map<string, CarnetStage>) {
  return {
    case: (c: CarnetCase) => (role === "day" ? c.tutor_id : (stages.get(c.stage_id)?.supervisor_id ?? null)),
    duty: (d: CarnetDuty) => (role === "day" ? d.supervisor_id : (stages.get(d.stage_id)?.supervisor_id ?? null)),
  };
}
