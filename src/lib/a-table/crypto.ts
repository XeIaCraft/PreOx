import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * At-rest encryption for user-supplied third-party API keys (Gemini,
 * Pexels). AES-256-GCM with a server-only key — ciphertext is what ever
 * touches the database; plaintext only exists for the duration of a
 * Server Action, right before calling the external API.
 */

function getKey(): Buffer {
  const secret = process.env.A_TABLE_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "Missing environment variable A_TABLE_ENCRYPTION_KEY. Generate one with `openssl rand -base64 32`."
    );
  }
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32) {
    throw new Error("A_TABLE_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of openssl rand -base64 32).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
