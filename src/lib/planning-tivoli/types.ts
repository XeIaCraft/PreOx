// Rows of the « Planning Tivoli » tables (migration 20260101000107).

import type { PlanningRead } from "./ocr";

export type PlanningRoomRow = {
  id: string;
  name: string;
  /** The room's column label in the planning image; empty: no column (exported empty). */
  image_label: string;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlanningPersonRow = {
  id: string;
  initials: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type PlanningOcrFixRow = {
  read: string;
  fixed: string;
  hits: number;
  updated_at: string;
};

/** Verified cells: date (YYYY-MM-DD) → room column label → initials as kept (« Ze-He »). */
export type PlanningCells = Record<string, Record<string, string>>;

export type PlanningWeekRow = {
  id: string;
  week_start: string | null;
  status: "draft" | "validated";
  source: "web" | "upload";
  image_hash: string;
  image_type: string;
  image_base64: string;
  image_width: number | null;
  image_height: number | null;
  ocr: PlanningRead;
  cells: PlanningCells;
  changed_since_validation: boolean;
  validated_at: string | null;
  validated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanningSettingsRow = {
  id: boolean;
  source_url: string;
  export_token_hash: string | null;
  last_checked_at: string | null;
  last_image_hash: string | null;
  last_error: string | null;
  updated_at: string;
};
