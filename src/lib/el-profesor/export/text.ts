// A block's text is plain text written to be shown as is (pre-wrapped): one
// idea per line, bullets as « • » lines. For print it's read back as
// paragraphs, bullet items and short « Indications : » lead lines.

export type TextLine =
  | { kind: "para"; text: string }
  | { kind: "lead"; text: string }
  | { kind: "bullet"; text: string; level: 0 | 1; marker: string };

const BULLET = /^(\s*)([•◦▪●○‣∙·*]|-|–|—)\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,2}[.)]|[a-z][.)])\s+(.*)$/;

export function parseText(raw: string, blockLabel?: string): TextLine[] {
  const lines: TextLine[] = [];
  const text = stripLabel(raw.replace(/\r\n?/g, "\n"), blockLabel);
  for (const rawLine of text.split("\n")) {
    if (!rawLine.trim()) continue;
    const bullet = BULLET.exec(rawLine);
    if (bullet) {
      const level = bullet[1].length >= 2 || bullet[2] === "◦" ? 1 : 0;
      // « • A • B » on one line: two items.
      for (const item of bullet[3].split(/\s+[•◦▪]\s+/)) if (item.trim()) lines.push({ kind: "bullet", text: item.trim(), level, marker: "•" });
      continue;
    }
    const numbered = NUMBERED.exec(rawLine);
    if (numbered) {
      lines.push({ kind: "bullet", text: numbered[3].trim(), level: numbered[1].length >= 2 ? 1 : 0, marker: numbered[2] });
      continue;
    }
    const line = rawLine.trim();
    // Several « • » inside one line (« Deux sources : • A • B »): the items are a list.
    const inline = line.split(/\s+[•◦▪]\s+/);
    if (inline.length >= 3 || (inline.length === 2 && line.startsWith("•"))) {
      const [head, ...items] = inline;
      const lead = head.replace(/^[•◦▪]\s*/, "").trim();
      if (lead) lines.push(/[:：]$/.test(lead) ? { kind: "lead", text: lead } : line.startsWith("•") ? { kind: "bullet", text: lead, level: 0, marker: "•" } : { kind: "para", text: lead });
      for (const item of items) if (item.trim()) lines.push({ kind: "bullet", text: item.trim(), level: 0, marker: "•" });
      continue;
    }
    // « Indications : » alone on its line introduces what follows.
    if (line.length <= 70 && /[:：]$/.test(line)) lines.push({ kind: "lead", text: line });
    else lines.push({ kind: "para", text: line });
  }
  return lines;
}

/** « À retenir — • … » / « À retenir\n• … »: the block's label already says it. */
function stripLabel(text: string, blockLabel?: string): string {
  const t = text.trim();
  const labels = ["À retenir", "A retenir", ...(blockLabel ? [blockLabel] : [])];
  for (const label of labels) {
    const next = t.charAt(label.length);
    if (t.toLowerCase().startsWith(label.toLowerCase()) && !/\p{L}/u.test(next)) {
      return t.slice(label.length).replace(/^\s*(par cœur)?\s*[:—–-]?\s*/i, "");
    }
  }
  return t;
}
