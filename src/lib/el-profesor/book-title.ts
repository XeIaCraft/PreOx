/**
 * "Miller's Anesthesia, 10th edition" → "Miller", "Morgan & Mikhail's
 * Clinical Anesthesiology" → "Morgan & Mikhail" — enough to tell the source
 * books of a merged fiche apart on a citation chip (the full title stays in
 * the chip's tooltip).
 */
export function shortBookTitle(title: string): string {
  const head = title.split(/[,:(—–]|\s-\s/)[0].trim();
  const words = head.split(/\s+/).map((w) => w.replace(/['’]s$/i, ""));
  if (words.length >= 3 && /^(&|et|and)$/i.test(words[1])) return `${words[0]} & ${words[2]}`;
  return words[0] || title;
}
