// Encryption of patient dossiers (Web Crypto, available in browsers and in
// Node for the tests). Two keys:
//
// - the device key: AES-GCM 256, generated on the device and stored as a
//   non-extractable CryptoKey — it can encrypt and decrypt, but its raw
//   bytes can never be read, sent or copied, not even by PreOx's own code;
// - a backup key derived from a passphrase (PBKDF2-SHA-256, 600 000
//   iterations): to save the dossiers to a file and restore them on
//   another device. The passphrase is never stored.

const PBKDF2_ITERATIONS = 600_000;

export interface Sealed {
  /** Base64 of the 12-byte IV. */
  iv: string;
  /** Base64 of the ciphertext (with GCM tag). */
  data: string;
}

export interface SealedBackup extends Sealed {
  format: "preox-preop-backup";
  version: 1;
  /** Base64 of the PBKDF2 salt. */
  salt: string;
  iterations: number;
  createdAt: string;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode(...arr.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function generateDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { iv: toBase64(iv), data: toBase64(data) };
}

export async function unseal<T>(key: CryptoKey, sealed: Sealed): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export const MIN_PASSPHRASE_LENGTH = 10;

export async function sealBackup(passphrase: string, value: unknown, iterations = PBKDF2_ITERATIONS): Promise<SealedBackup> {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`Mot de passe trop court (au moins ${MIN_PASSPHRASE_LENGTH} caractères).`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await passphraseKey(passphrase, salt, iterations);
  const sealed = await seal(key, value);
  return { format: "preox-preop-backup", version: 1, salt: toBase64(salt), iterations, createdAt: new Date().toISOString(), ...sealed };
}

export async function unsealBackup<T>(passphrase: string, backup: SealedBackup): Promise<T> {
  if (backup?.format !== "preox-preop-backup") throw new Error("Ce fichier n'est pas une sauvegarde Préop.");
  const key = await passphraseKey(passphrase, fromBase64(backup.salt), backup.iterations);
  try {
    return await unseal<T>(key, backup);
  } catch {
    throw new Error("Mot de passe incorrect ou fichier abîmé.");
  }
}
