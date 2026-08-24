/**
 * Cloze deletion flashcards ("flashcards à trous", piste d'amélioration
 * 2026-08-24) — pure text parsing, no DB/React involved so it's directly
 * unit-testable. The admin types the passage with blanks marked as
 * `{{answer}}`; this strips the markers into plain text plus the
 * character ranges to hide, which is what actually gets persisted
 * (flashcards.front.text + flashcards.cloze_ranges) — never the raw
 * `{{...}}` markup itself, so rendering never has to re-parse it.
 */

export interface ClozeRange {
  start: number;
  end: number;
}

/** `{{réponse}}` markers -> plain text (markers stripped) + the character ranges the removed markers occupied. An unclosed `{{` is kept as literal text rather than silently dropped. */
export function parseClozeText(raw: string): { text: string; ranges: ClozeRange[] } {
  const ranges: ClozeRange[] = [];
  let text = "";
  let i = 0;
  while (i < raw.length) {
    const openIdx = raw.indexOf("{{", i);
    if (openIdx === -1) {
      text += raw.slice(i);
      break;
    }
    text += raw.slice(i, openIdx);
    const closeIdx = raw.indexOf("}}", openIdx + 2);
    if (closeIdx === -1) {
      text += raw.slice(openIdx);
      break;
    }
    const blank = raw.slice(openIdx + 2, closeIdx);
    if (blank.length > 0) ranges.push({ start: text.length, end: text.length + blank.length });
    text += blank;
    i = closeIdx + 2;
  }
  return { text, ranges };
}

/** Reconstructs `{{...}}` markup from plain text + ranges — the inverse of parseClozeText, used to pre-fill the editor when reopening an existing cloze card. */
export function formatClozeText(text: string, ranges: ClozeRange[]): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const r of sorted) {
    result += text.slice(cursor, r.start) + "{{" + text.slice(r.start, r.end) + "}}";
    cursor = r.end;
  }
  result += text.slice(cursor);
  return result;
}

/** Plain text with every range replaced by `mask` — the front of a cloze card during review. */
export function maskClozeText(text: string, ranges: ClozeRange[], mask = "[...]"): string {
  if (ranges.length === 0) return text;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const r of sorted) {
    result += text.slice(cursor, r.start) + mask;
    cursor = r.end;
  }
  result += text.slice(cursor);
  return result;
}

/** Splits text into plain/hidden segments for rendering the revealed back with each answer highlighted in place. */
export function splitClozeSegments(text: string, ranges: ClozeRange[]): { text: string; hidden: boolean }[] {
  if (ranges.length === 0) return [{ text, hidden: false }];
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const segments: { text: string; hidden: boolean }[] = [];
  let cursor = 0;
  for (const r of sorted) {
    if (r.start > cursor) segments.push({ text: text.slice(cursor, r.start), hidden: false });
    segments.push({ text: text.slice(r.start, r.end), hidden: true });
    cursor = r.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hidden: false });
  return segments;
}
