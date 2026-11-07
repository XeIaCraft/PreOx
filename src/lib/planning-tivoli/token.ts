import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * The export token of =IMPORTDATA (which cannot log in): only its sha256 is
 * stored; the token itself is shown once, when it is made, and can be
 * revoked or made again from the module.
 */
export function generateExportToken(): { token: string; hash: string } {
  const token = `plt_${randomBytes(24).toString("hex")}`;
  return { token, hash: hashExportToken(token) };
}

export function hashExportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token given against the stored hash, in constant time. */
export function tokenMatches(token: string, storedHash: string | null): boolean {
  if (!token || !storedHash) return false;
  const a = Buffer.from(hashExportToken(token), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
