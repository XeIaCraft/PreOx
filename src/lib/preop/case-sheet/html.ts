// The day's case sheet as printed: A5, one block per patient, numbered,
// never split across two pages — the same markup for the screen's preview
// and for the print window, so what is checked is what is printed.

import type { CaseSheet, SheetText } from "./build";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const texts = (list: SheetText[], sep = ", ") => list.map((t) => (t.strong ? `<b>${esc(t.text)}</b>` : esc(t.text))).join(sep);
const line = (label: string, html: string) => (html ? `<p><span class="k">${esc(label)} :</span> ${html}</p>` : "");

export function caseSheetHtml(sheet: CaseSheet, index: number): string {
  const head = [sheet.surgery, ...sheet.tags].map(esc).join(", ");
  const atcd = sheet.antecedents.length ? texts(sheet.antecedents) : "RAS";
  return `<article class="case">
<h3>${index}/ ${esc(sheet.initials)}, ${head}</h3>
<p>${esc(sheet.body)}</p>
<p class="tech">${esc(sheet.technique)}</p>
${sheet.rows.map((r) => line(r.label, texts(r.parts, " · "))).join("")}
${line("ATCD", atcd)}
${sheet.implications.map((i) => `<p class="imp">→ ${esc(i)}</p>`).join("")}
${line("Chir.", esc(sheet.surgical))}
${line("TTT", sheet.treatments.length ? texts(sheet.treatments, " ; ") : "aucun")}
${line("Allergies", texts(sheet.allergies))}
${sheet.alerts.map((a) => `<p class="alert">! ${esc(a)}</p>`).join("")}
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
${s(".case .note")}{padding-left:2mm;border-left:0.6mm solid #9fb6b9;color:#333a3f;white-space:pre-wrap}
`;
}

/** The whole printable page. */
export function caseSheetDocument(sheets: CaseSheet[], title: string): string {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A5;margin:8mm 8mm 9mm}body{margin:0}h1{font:600 10pt -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:0 0 3mm}${caseSheetCss()}</style>
</head><body><h1>${esc(title)}</h1>${sheets.map((s, i) => caseSheetHtml(s, i + 1)).join("")}</body></html>`;
}
