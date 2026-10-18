const ARTICLE = /^(le|la|les|l['’]|un|une|the|a|an)$/i;
const GENERIC = /^(manuel|livre|traité|précis|guide|abrégé|mémento|memento|atlas|handbook|textbook|manual|basic|clinical|essentials?|principles|fundamentals)$/i;

/**
 * A short name for a source book, enough to tell the books of a merged
 * fiche apart on a citation chip (the full title stays in the chip's
 * tooltip): the author when the title is built on one ("Miller's
 * Anesthesia" → "Miller", "Morgan & Mikhail's…" → "Morgan & Mikhail",
 * "Manuel pratique d'anesthésie (Albrecht)" → "Albrecht"), else the first
 * meaningful words ("Manuel de ventilation…" → "Manuel de ventilation",
 * "Le livre de l'interne" → "Livre de l'interne").
 */
export function shortBookTitle(title: string): string {
  const author = /\(([A-ZÀ-Ý][\p{L}'’-]+(?:\s(?:&|et|and)\s[A-ZÀ-Ý][\p{L}'’-]+)?)\)/u.exec(title)?.[1];
  if (author) return author;
  const head = title.split(/[,:(—–]|\s-\s/)[0].trim();
  let words = head.split(/\s+/).filter(Boolean);
  if (words.length > 1 && ARTICLE.test(words[0])) words = words.slice(1);
  if (words.length === 0) return title;
  if (GENERIC.test(words[0])) {
    const out: string[] = [];
    let meaningful = 0;
    for (const w of words) {
      out.push(w);
      if (w.replace(/^[dl]['’]/i, "").length >= 4) meaningful++;
      if (meaningful >= 2) break;
    }
    const name = out.join(" ");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  const plain = words.map((w) => w.replace(/['’]s$/i, ""));
  if (plain.length >= 3 && /^(&|et|and)$/i.test(plain[1])) return `${plain[0]} & ${plain[2]}`;
  return plain[0];
}
