/**
 * Verbatim-quote-to-text-item matching, used by pdf-viewer.tsx to position
 * citation/coverage highlights over pdfjs's text layer. Extracted out of
 * that "use client" component (rather than left as a local closure) so it
 * can be unit-tested without a DOM — see pdf-text-match.test.ts.
 */

export function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Citation quotes come from Gemini/Claude reading the PDF, not from
// copy-pasting its text layer, so they can diverge slightly (hyphenation,
// dashes/quotes, a paraphrased tail). Try an exact match on a long prefix
// first, then fall back to shorter prefixes so a passage still highlights
// when only the start of the quote lines up with the extracted text.
const MATCH_PREFIX_LENGTHS = [120, 60, 30];

/** Finds the text items overlapping a (possibly partial) verbatim quote within a page's text content. */
export function matchItems<T extends { str: string }>(items: T[], quote: string): T[] {
  const needle = normalize(quote);
  if (!needle) return [];

  const normalizedItems = items.map((item) => normalize(item.str));
  const haystack = normalizedItems.join(" ");

  let matchIndex = -1;
  for (const len of MATCH_PREFIX_LENGTHS) {
    const prefixLen = Math.min(needle.length, len);
    if (prefixLen < 8) break;
    matchIndex = haystack.indexOf(needle.slice(0, prefixLen));
    if (matchIndex !== -1) break;
  }
  if (matchIndex === -1) return [];

  let offset = 0;
  const matchEnd = matchIndex + needle.length;
  const matched: T[] = [];
  for (let i = 0; i < items.length; i++) {
    const start = offset;
    const end = start + normalizedItems[i].length;
    if (end >= matchIndex && start <= matchEnd) matched.push(items[i]);
    offset = end + 1;
  }
  return matched;
}
