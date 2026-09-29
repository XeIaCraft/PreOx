/** A readable temporary password that satisfies the password rules (upper, lower, digit, special, ≥ 12). */
export function generateTemporaryPassword(): string {
  const pick = (chars: string) => chars[crypto.getRandomValues(new Uint32Array(1))[0] % chars.length];
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const special = "!?#@%+";
  const body = Array.from({ length: 8 }, () => pick(lower + digits)).join("");
  return `${pick(upper)}${body}${pick(digits)}${pick(special)}${pick(upper)}`;
}
