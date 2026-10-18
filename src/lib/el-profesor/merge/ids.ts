import { createHash } from "node:crypto";

/**
 * Same inputs, same uuid (name-based, v5 layout). Rows the pipeline creates
 * at a stage transition (chapters, merged fiches) get ids derived from the
 * job and their place in the plan, so a transition interrupted halfway (a
 * function killed at its time limit) and run again upserts the same rows
 * instead of duplicating them.
 */
export function stableUuid(...parts: string[]): string {
  const h = createHash("sha1").update(parts.join("|")).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
