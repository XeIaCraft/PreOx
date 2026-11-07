// Reading the « Anesth » cells of the theatre planning: « Ze-He » is a
// resident (PG, « Ze ») with a senior (« He ») — the planning writes the
// separator « - », « + » or « / » alike —, « Sad » someone alone, an empty
// cell nobody. Anything else (« ? », three people, unreadable initials) is
// kept as written and flagged: never guessed into something it may not be.

export type Assignment =
  | { kind: "empty" }
  /** `people`: as written, left to right (the END column gives one room to each). */
  | { kind: "ok"; senior: string; pg?: string; people: string[] }
  | { kind: "invalid"; text: string; reason: string };

/** Initials as compared: no accents, no spaces, lower case. */
export const normInitials = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();

/** One person's initials: letters only, 1 to 5. */
const TOKEN = /^[A-Za-zÀ-ÿ]{1,5}$/;
/** Between two people: « - », « + » or « / ». */
const SEPARATOR = /[-+/]/;

/** A cell's text as written, cleaned: dashes unified, spaces around the separators dropped. */
export function cleanCell(raw: string): string {
  return raw
    .replace(/[‐-―−]/g, "-")
    .replace(/\s*([-+/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAssignment(raw: string): Assignment {
  const text = cleanCell(raw);
  if (!text) return { kind: "empty" };
  if (text.includes("?")) return { kind: "invalid", text, reason: "point d'interrogation dans la case" };
  const parts = text.split(SEPARATOR);
  if (parts.some((p) => !TOKEN.test(p))) return { kind: "invalid", text, reason: "initiales illisibles" };
  if (parts.length === 1) return { kind: "ok", senior: parts[0], people: parts };
  if (parts.length === 2) return { kind: "ok", pg: parts[0], senior: parts[1], people: parts };
  return { kind: "invalid", text, reason: "plus de deux personnes" };
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export type MatchKind = "exact" | "learned" | "near" | "unknown";

export interface TokenMatch {
  /** The initials kept: the known ones when found, else as read. */
  value: string;
  kind: MatchKind;
  /** As read, when it was changed. */
  read?: string;
}

/**
 * One person's initials read by the OCR, against the initials known: the
 * same (case and spaces aside), a misreading learned from an earlier
 * correction (« Hc » → « He »), or one letter off a single known one —
 * changed, and said so. Two candidates as close, or none: left as read.
 */
export function matchToken(token: string, known: string[], learned: Record<string, string> = {}): TokenMatch {
  const n = normInitials(token);
  const exact = known.find((k) => normInitials(k) === n);
  if (exact) return { value: exact, kind: "exact" };
  const fix = learned[n];
  if (fix) return { value: fix, kind: "learned", read: token };
  if (n.length >= 2) {
    const near = known.filter((k) => {
      const m = normInitials(k);
      return Math.abs(m.length - n.length) <= 1 && distance(m, n) === 1;
    });
    if (near.length === 1) return { value: near[0], kind: "near", read: token };
  }
  return { value: token, kind: "unknown" };
}

export interface CellMatch {
  /** The cell as kept (initials matched), e.g. « Ze-He ». */
  text: string;
  assignment: Assignment;
  /** Every change made to what was read, and every initial still unknown. */
  changes: { read: string; value: string; kind: "learned" | "near" }[];
  unknown: string[];
}

/** A whole cell read by the OCR, its initials matched one by one. */
export function matchCell(read: string, known: string[], learned: Record<string, string> = {}): CellMatch {
  const first = parseAssignment(read);
  if (first.kind !== "ok") return { text: first.kind === "invalid" ? first.text : "", assignment: first, changes: [], unknown: [] };
  const changes: CellMatch["changes"] = [];
  const unknown: string[] = [];
  const one = (t: string) => {
    const m = matchToken(t, known, learned);
    if (m.kind === "learned" || m.kind === "near") changes.push({ read: t, value: m.value, kind: m.kind });
    if (m.kind === "unknown") unknown.push(t);
    return m.value;
  };
  // « ZelFr »: a « / » read as « l » (or « I », « | », « 1 ») between two known initials — proposed as « Ze-Fr », said so.
  if (first.pg === undefined && !known.some((k) => normInitials(k) === normInitials(first.senior))) {
    const t = first.senior;
    for (let i = 1; i < t.length - 1; i++) {
      if (!"lI|1".includes(t[i])) continue;
      const a = matchToken(t.slice(0, i), known, learned);
      const b = matchToken(t.slice(i + 1), known, learned);
      if (a.kind === "exact" && b.kind === "exact") {
        const text = `${a.value}-${b.value}`;
        return { text, assignment: parseAssignment(text), changes: [{ read: t, value: text, kind: "near" }], unknown: [] };
      }
    }
  }
  const senior = one(first.senior);
  const pg = first.pg !== undefined ? one(first.pg) : undefined;
  const text = pg !== undefined ? `${pg}-${senior}` : senior;
  return { text, assignment: { kind: "ok", senior, ...(pg !== undefined ? { pg } : {}), people: pg !== undefined ? [pg, senior] : [senior] }, changes, unknown };
}

/** What a correction teaches: each initial read that became another one (« Hc » → « He »). */
export function learnedFrom(read: string, kept: string): Record<string, string> {
  const a = parseAssignment(read);
  const b = parseAssignment(kept);
  if (a.kind !== "ok" || b.kind !== "ok") return {};
  const out: Record<string, string> = {};
  if (normInitials(a.senior) !== normInitials(b.senior)) out[normInitials(a.senior)] = b.senior;
  if (a.pg !== undefined && b.pg !== undefined && normInitials(a.pg) !== normInitials(b.pg)) out[normInitials(a.pg)] = b.pg;
  return out;
}

export type Role = "pg" | "senior";

export interface Roles {
  senior?: string;
  pg?: string;
  /** Alone in a room where a resident or a senior can be, and the role is not known: to settle. */
  undecided?: string;
}

/**
 * Who is senior and who is resident in a cell, for one room. Two people:
 * « PG-Sénior ». Alone: the senior — except in a room where either can be
 * alone (« CON »), where the person's role in the initials table decides
 * (unknown: undecided, never guessed). A room that takes one person of the
 * cell (`part`: END, the first for Endo C24, the second for Endo 3) has that
 * person alone in it.
 */
export function rolesOf(a: Assignment, solo: "senior" | "either" = "senior", roleOf: (initials: string) => Role | null = () => null, part?: 1 | 2 | null): Roles {
  if (a.kind !== "ok") return {};
  if (part) {
    const who = a.people[part - 1];
    return who ? rolesOf({ kind: "ok", senior: who, people: [who] }, solo, roleOf) : {};
  }
  if (a.pg !== undefined) return { senior: a.senior, pg: a.pg };
  if (solo === "senior") return { senior: a.senior };
  const role = roleOf(a.senior);
  return role === "pg" ? { pg: a.senior } : role === "senior" ? { senior: a.senior } : { undecided: a.senior };
}
