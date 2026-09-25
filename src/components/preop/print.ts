"use client";

// Prints a small, clean page (recap for the official sheet, instructions
// for the patient) instead of the whole app screen.

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function printSections(title: string, sections: { title: string; lines: string[] }[], footer?: string): boolean {
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return false;
  const body = sections
    .map((s) => `<section><h2>${esc(s.title)}</h2><ul>${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section>`)
    .join("");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d2226;margin:28px 34px}
  h1{font-size:19px;margin:0 0 14px}
  h2{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#1f5f63;margin:14px 0 4px;border-bottom:1px solid #d8dde0;padding-bottom:2px}
  ul{margin:0;padding-left:16px} li{margin:1px 0}
  footer{margin-top:22px;font-size:10px;color:#6b7378}
  @page{margin:14mm}
</style></head><body><h1>${esc(title)}</h1>${body}${footer ? `<footer>${esc(footer)}</footer>` : ""}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 150);
  return true;
}
