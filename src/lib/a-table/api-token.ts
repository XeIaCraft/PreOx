import "server-only";

import { createHash, randomBytes } from "node:crypto";

/**
 * Personal API tokens for the read-only automation endpoint: only a sha256
 * hash is ever stored, so a leaked database can't be turned back into a
 * usable credential — the raw token is generated once, shown to the user
 * exactly once, and never persisted anywhere.
 */

export function generateApiToken(): { token: string; hash: string } {
  const token = `atb_${randomBytes(24).toString("hex")}`;
  return { token, hash: hashApiToken(token) };
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
