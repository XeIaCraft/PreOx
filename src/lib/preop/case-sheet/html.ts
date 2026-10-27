// The day's case sheet as printed: A5, one block per patient, numbered,
// never split across two pages — the same markup for the screen's preview
// and for the print window, so what is checked is what is printed.

import type { CaseSheet, SheetText } from "./build";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Lines taken off the sheet, by key: « row:Analgésie » (a whole line),
 * « Analgésie:Kétorolac 30 mg » (one product), « atcd:… », « ttt:… »,
 * « alert:… »… Keys are the text, so a line keeps its choice as long as
 * it reads the same.
 */
export type HiddenLines = ReadonlySet<string>;

export interface SheetHtmlOptions {
  hidden?: HiddenLines;
  /** The preview: every line can be touched, hidden ones shown struck through. */
  editable?: boolean;
}

export function caseSheetHtml(sheet: CaseSheet, index: number, opts: SheetHtmlOptions = {}): string {
  const hidden = opts.hidden ?? new Set<string>();
  const edit = !!opts.editable;
  /** One removable piece: left out of the print, struck through in the preview. */
  const piece = (key: string, html: string, tag = "span", cls = "") => {
    const off = hidden.has(key);
    if (off && !edit) return "";
    const classes = [cls, off ? "off" : ""].filter(Boolean).join(" ");
    return `<${tag}${classes ? ` class="${classes}"` : ""}${edit ? ` data-k="${esc(key)}" role="button" tabindex="0" aria-pressed="${off}" title="${off ? "Toucher pour remettre" : "Toucher pour retirer de la feuille"}"` : ""}>${html}</${tag}>`;
  };
  const textOf = (t: SheetText) => (t.strong ? `<b>${esc(t.text)}</b>` : esc(t.text));
  /** « Label : a · b · c » — the label takes the whole line off, each item itself. */
  const line = (prefix: string, label: string, items: SheetText[], sep: string, empty?: string) => {
    const rowKey = `row:${label}`;
    const shown = items.map((t) => piece(`${prefix}:${t.text}`, textOf(t))).filter(Boolean);
    if (!shown.length && !empty) return "";
    if (hidden.has(rowKey) && !edit) return "";
    if (!edit && items.length && items.every((t) => hidden.has(`${prefix}:${t.text}`))) return "";
    const body = shown.length ? shown.join(sep) : esc(empty!);
    return piece(rowKey, `<span class="k">${esc(label)} :</span> ${body}`, "p");
  };
  const head = [sheet.surgery, ...sheet.tags].map(esc).join(", ");
  return `<article class="case">
<h3>${index}/ ${esc(sheet.initials)}, ${head}</h3>
<p>${esc(sheet.body)}</p>
${piece("tech", esc(sheet.technique), "p", "tech")}
${sheet.rows.map((r) => line(r.label, r.label, r.parts, " · ")).join("")}
${line("atcd", "ATCD", sheet.antecedents, ", ", "RAS")}
${sheet.implications.map((i) => piece(`imp:${i}`, `→ ${esc(i)}`, "p", "imp")).join("")}
${sheet.surgical ? piece("chir", `<span class="k">Chir. :</span> ${esc(sheet.surgical)}`, "p") : ""}
${line("ttt", "TTT", sheet.treatments, " ; ", "aucun")}
${line("allergy", "Allergies", sheet.allergies, ", ")}
${sheet.alerts.map((a) => piece(`alert:${a}`, `! ${esc(a)}`, "p", "alert")).join("")}
${sheet.notes.map((n) => `<p class="note">${esc(n)}</p>`).join("")}
</article>`;
}

/** Styles of the sheet, scoped under `scope` (the preview) or the page (print). */
export function caseSheetCss(scope = ""): string {
  const s = (sel: string) => (scope ? `${scope} ${sel}` : sel);
  return `
${s(".case")}{break-inside:avoid;page-break-inside:avoid;padding:0 0 3.5mm;margin:0 0 3.5mm;border-bottom:0.3mm solid #c9cfd3;font:8.6pt/1.32 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#15191c}
${s(".case:last-child")}{border-bottom:0}
${s(".case h3")}{font-size:9.6pt;margin:0 0 0.8mm;text-transform:uppercase;letter-spacing:.01em}
${s(".case p")}{margin:0.25mm 0}
${s(".case .k")}{font-weight:600;color:#1f4f53}
${s(".case .tech")}{font-weight:600}
${s(".case .imp")}{padding-left:3mm;color:#333a3f}
${s(".case .alert")}{font-weight:700;color:#8a1f12}
${s(".case [data-k]")}{cursor:pointer;border-radius:1mm}
${s(".case [data-k]:hover")}{background:#eef3f3}
${s(".case [data-k]:focus-visible")}{outline:2px solid #2f5d54;outline-offset:1px}
${s(".case .off")}{opacity:.38;text-decoration:line-through}
${s(".case .note")}{padding-left:2mm;border-left:0.6mm solid #9fb6b9;color:#333a3f;white-space:pre-wrap}
`;
}

/** The whole printable page. */
export function caseSheetDocument(sheets: { sheet: CaseSheet; hidden?: HiddenLines }[], title: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A5;margin:8mm 8mm 9mm}body{margin:0}h1{font:600 10pt -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:0 0 3mm}${caseSheetCss()}</style>
</head><body><h1>${esc(title)}</h1>${sheets.map((s, i) => caseSheetHtml(s.sheet, i + 1, { hidden: s.hidden })).join("")}</body></html>`;
}
